/**
 * ActivityPods Outbox Event Emitter Service
 *
 * This Moleculer service emits events when activities are committed to outboxes.
 * The sidecar listens to these events to:
 * 1. Produce to RedPanda Stream1 (for public activities)
 * 2. Create delivery jobs in Redis (for remote federation)
 *
 * This replaces the "watch outboxes via Solid Notifications" approach with
 * a more reliable event-driven pattern.
 */
'use strict';

const { ulid } = require('ulid');
const { retryWithBackoff } = require('../utils/backoff');

const { resolvePublicSearchConsent } = require('../utils/search-consent');

const { extractHashtagsFromText } = require('../utils/hashtags');

module.exports = {
  name: 'outbox-emitter',

  dependencies: ['activitypub.outbox', 'followable'],

  settings: {
    // Sidecar webhook URL for event delivery
    sidecarWebhookUrl: process.env.SIDECAR_WEBHOOK_URL || 'http://fedify-sidecar:8080/webhook/outbox',
    sidecarToken: process.env.SIDECAR_TOKEN || '',

    // Retry settings for webhook delivery
    webhookRetries: Number(process.env.WEBHOOK_RETRIES) || 3,
    webhookTimeoutMs: Number(process.env.WEBHOOK_TIMEOUT_MS) || 5000
  },

  events: {
    /**
     * Listen for outbox activity commits.
     * This event is emitted by ActivityPods when an activity is successfully
     * committed to an actor's outbox.
     */
    'activitypub.outbox.posted': {
      async handler(ctx) {
        const { activity } = ctx.params;
        const actorUri = typeof activity.actor === 'string' ? activity.actor : activity.actor?.id || null;
        const visibility = this.determineVisibility(activity);
        const isPublicActivity = visibility === 'public' || visibility === 'unlisted';
        const searchConsent = await this.buildSearchConsent(ctx, activity, actorUri);

        // Resolve remote delivery targets (not provided by ActivityPods in this event)
        let deliveryTargets = [];
        if (actorUri) {
          try {
            const result = await ctx.call('outbox-emitter.resolveDeliveryTargets', { actorUri, activity });
            deliveryTargets = result.targets || [];
          } catch (err) {
            this.logger.warn('Failed to resolve delivery targets', { actorUri, error: err.message });
          }
        }

        // Build the event payload matching the Stream1 schema
        const event = {
          schema: 'ap.outbox.committed.v1',
          eventId: ulid(),
          timestamp: new Date().toISOString(),

          // Source
          actorUri,
          podDataset: ctx.meta?.podDataset,

          // Activity
          activityId: activity.id || activity['@id'],
          objectId: this.extractObjectId(activity),
          activityType: activity.type || activity['@type'],
          activity,

          // Delivery targets (resolved above)
          deliveryTargets,

          // Metadata
          meta: {
            isPublicActivity,
            isPublicIndexable: isPublicActivity && searchConsent.isPublic,
            isDeleteOrTombstone: this.isDeleteOrTombstone(activity),
            visibility,
            searchConsent,
            hashtags: this.extractMetadataHashtags(activity)
          }
        };

        // Emit internal event for local consumers
        ctx.emit('outbox.event.ready', event);

        // Deliver to sidecar webhook
        await this.deliverToSidecar(ctx, event);
      }
    }
  },

  actions: {
    /**
     * Manually emit an outbox event (for testing/reconciliation).
     */
    emitEvent: {
      params: {
        actorUri: { type: 'string' },
        activity: { type: 'object' },
        deliveryTargets: { type: 'array', optional: true }
      },
      async handler(ctx) {
        const { actorUri, activity, deliveryTargets } = ctx.params;
        const visibility = this.determineVisibility(activity);
        const isPublicActivity = visibility === 'public' || visibility === 'unlisted';
        const searchConsent = await this.buildSearchConsent(ctx, activity, actorUri);

        const event = {
          schema: 'ap.outbox.committed.v1',
          eventId: ulid(),
          timestamp: new Date().toISOString(),
          actorUri,
          activityId: activity.id || activity['@id'],
          objectId: this.extractObjectId(activity),
          activityType: activity.type || activity['@type'],
          activity,
          deliveryTargets: deliveryTargets || [],
          meta: {
            isPublicActivity,
            isPublicIndexable: isPublicActivity && searchConsent.isPublic,
            isDeleteOrTombstone: this.isDeleteOrTombstone(activity),
            visibility,
            searchConsent,
            hashtags: this.extractMetadataHashtags(activity)
          }
        };

        await this.deliverToSidecar(ctx, event);
        return { success: true, eventId: event.eventId };
      }
    },

    /**
     * Resolve delivery targets for an activity.
     * This is called by the sidecar if it needs to resolve targets itself.
     */
    resolveDeliveryTargets: {
      params: {
        actorUri: { type: 'string' },
        activity: { type: 'object' }
      },
      async handler(ctx) {
        const { actorUri, activity } = ctx.params;

        if (this.isFollowActivity(activity)) {
          const resolved = await ctx.call('followable.resolveFollowActivityDelivery', {
            activity,
            recursionLimit: 1,
            requireFollowersCollection: true,
            webId: 'system'
          });

          if (this.isLikelyLocalDelivery(actorUri, resolved.delivery)) {
            return { targets: [] };
          }

          return {
            targets: [this.toWebhookDeliveryTarget(resolved.delivery)]
          };
        }

        // Get recipients from to/cc/bto/bcc
        const recipients = this.extractRecipients(activity);

        // Resolve recipients to inbox URLs in parallel for performance
        const targetResults = await Promise.all(
          recipients.map(async recipientUri => {
            try {
              // Skip local actors (handled by internal federation)
              const isLocal = await ctx.call('activitypub.actor.isLocal', { actorUri: recipientUri });
              if (isLocal) return null;

              // Resolve remote actor's inbox
              const actorDoc = await ctx.call('activitypub.actor.get', { actorUri: recipientUri });
              if (actorDoc) {
                const host = new URL(recipientUri).hostname;
                return {
                  targetDomain: host,
                  inboxUrl: actorDoc.inbox,
                  sharedInboxUrl: actorDoc.endpoints?.sharedInbox || actorDoc.inbox
                };
              }
            } catch (err) {
              this.logger.warn('Failed to resolve recipient', { recipientUri, error: err.message });
            }
            return null;
          })
        );

        // Filter out nulls (local or failed resolutions)
        const targets = targetResults.filter(t => t !== null);

        // Deduplicate by sharedInbox
        const deduped = this.deduplicateBySharedInbox(targets);

        return { targets: deduped };
      }
    }
  },

  methods: {
    /**
     * Deliver event to sidecar webhook.
     */
    async deliverToSidecar(ctx, event) {
      const url = this.settings.sidecarWebhookUrl;

      // Build the webhook payload in the shape the sidecar expects.
      // The internal event schema differs from the sidecar's webhook contract.
      const payload = {
        actorUri: event.actorUri,
        activityId: event.activityId,
        activity: event.activity,
        remoteTargets: event.deliveryTargets, // sidecar validates body.remoteTargets
        meta: event.meta
      };

      try {
        await retryWithBackoff(
          async () => {
            const headers = {
              'Content-Type': 'application/json',
              'X-Event-Id': event.eventId,
              'X-Event-Schema': event.schema
            };
            if (this.settings.sidecarToken) {
              headers.Authorization = `Bearer ${this.settings.sidecarToken}`;
            }

            const response = await fetch(url, {
              method: 'POST',
              headers,
              body: JSON.stringify(payload),
              signal: AbortSignal.timeout(this.settings.webhookTimeoutMs)
            });

            if (!response.ok) {
              const error = new Error(`Sidecar webhook returned ${response.status}`);
              error.retryable = response.status === 429 || response.status >= 500;
              throw error;
            }

            this.logger.debug('Delivered event to sidecar', {
              eventId: event.eventId,
              activityId: event.activityId
            });
          },
          {
            maxRetries: Math.max(0, this.settings.webhookRetries - 1),
            baseDelayMs: 250,
            maxDelayMs: 5000,
            retryIf: err => err.retryable !== false
          }
        );
      } catch (err) {
        this.logger.error('Failed to deliver event to sidecar after retries', {
          eventId: event.eventId,
          activityId: event.activityId,
          error: err.message
        });
      }
    },

    /**
     * Extract object ID from activity.
     */
    extractObjectId(activity) {
      const object = activity.object;
      if (!object) return null;
      if (typeof object === 'string') return object;
      return object.id || object['@id'] || null;
    },

    /**
     * Check if activity is a delete or tombstone.
     */
    isDeleteOrTombstone(activity) {
      const type = activity.type || activity['@type'];
      return type === 'Delete' || type === 'Tombstone' || (type === 'Undo' && activity.object?.type === 'Announce');
    },

    /**
     * Determine visibility level.
     */
    determineVisibility(activity) {
      const publicAddress = 'https://www.w3.org/ns/activitystreams#Public';
      const to = Array.isArray(activity.to) ? activity.to : [activity.to];
      const cc = Array.isArray(activity.cc) ? activity.cc : [activity.cc];

      if (to.includes(publicAddress) || to.includes('as:Public')) {
        return 'public';
      }
      if (cc.includes(publicAddress) || cc.includes('as:Public')) {
        return 'unlisted';
      }
      if (to.some(r => r?.endsWith('/followers'))) {
        return 'followers';
      }
      return 'direct';
    },

    /**
     * Build a search consent descriptor for the activity's inner object.
     * Included in the event meta so the sidecar can skip indexing without
     * re-parsing the object.
     *
     * Shape: { raw: string[], isPublic: boolean, explicitlySet: boolean }
     */
    async buildSearchConsent(ctx, activity, actorUri) {
      const obj = activity.object && typeof activity.object === 'object' ? activity.object : activity;
      let attributedToActor = null;

      if (actorUri && typeof ctx.call === 'function') {
        attributedToActor = await Promise.resolve(
          ctx.call('activitypub.actor.get', {
            actorUri,
            webId: 'system'
          })
        ).catch(error => {
          this.logger.warn('Failed to resolve actor search consent for outbox event', {
            actorUri,
            error: error.message
          });
          return null;
        });
      }

      return resolvePublicSearchConsent(obj, { attributedToActor });
    },

    /**
     * Extract hashtags for dual-protocol metadata (Facets).
     * This allows the Firehose to serve hashtags as structured data
     * without requiring consumers to parse the HTML content.
     */
    extractMetadataHashtags(activity) {
      const obj = activity.object && typeof activity.object === 'object' ? activity.object : activity;

      return extractHashtagsFromText(obj.content || '');
    },

    /**
     * Extract all recipients from activity.
     */
    extractRecipients(activity) {
      const recipients = new Set();

      for (const field of ['to', 'cc', 'bto', 'bcc']) {
        const values = activity[field];
        if (!values) continue;

        const arr = Array.isArray(values) ? values : [values];
        for (const v of arr) {
          if (typeof v === 'string' && v.startsWith('http')) {
            recipients.add(v);
          }
        }
      }

      // Expand followers collection if present
      // (This would need additional logic to resolve followers)

      return [...recipients];
    },

    /**
     * Deduplicate targets by shared inbox.
     */
    deduplicateBySharedInbox(targets) {
      const seen = new Map();

      for (const target of targets) {
        const key = target.sharedInboxUrl || target.inboxUrl;
        if (!seen.has(key)) {
          seen.set(key, target);
        }
      }

      return [...seen.values()];
    },

    isFollowActivity(activity) {
      const type = activity?.type || activity?.['@type'];
      return type === 'Follow';
    },

    toWebhookDeliveryTarget(delivery) {
      return {
        targetDomain: delivery.targetDomain,
        inboxUrl: delivery.recipients[0],
        ...(delivery.sharedInbox ? { sharedInboxUrl: delivery.sharedInbox } : {})
      };
    },

    isLikelyLocalDelivery(actorUri, delivery) {
      try {
        const actorOrigin = new URL(actorUri).origin;
        const inboxOrigin = new URL(delivery.recipients[0]).origin;
        return actorOrigin === inboxOrigin;
      } catch {
        return false;
      }
    }
  }
};
