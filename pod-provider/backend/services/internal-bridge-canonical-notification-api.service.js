'use strict';

const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;
const { Errors: WebErrors } = require('moleculer-web');
const CONFIG = require('../config/config');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALID_KINDS = new Set([
  'PostCreate',
  'PostEdit',
  'PostDelete',
  'ReactionAdd',
  'ReactionRemove',
  'ShareAdd',
  'ShareRemove',
  'FollowAdd',
  'FollowRemove',
  'ProfileUpdate',
  'AccountState'
]);

const NOTIFICATION_KINDS = new Set(['ReactionAdd', 'ShareAdd', 'FollowAdd', 'PostCreate']);

const VALID_PROTOCOLS = new Set(['activitypub', 'atproto']);

const AS_CONTEXT = 'https://www.w3.org/ns/activitystreams';

// Max actor URI length to accept (prevents excessively large inputs)
const MAX_URI_LENGTH = 2048;

// ---------------------------------------------------------------------------
// Service definition
// ---------------------------------------------------------------------------

module.exports = {
  name: 'internal-bridge-canonical-notification-api',

  dependencies: ['api', 'activitypub.actor', 'activitypub.inbox', 'internal-identity-projection'],

  settings: {
    auth: {
      bearerToken: process.env.ACTIVITYPODS_TOKEN || process.env.INTERNAL_API_TOKEN || process.env.SIDECAR_TOKEN || ''
    },
    routePath: '/api/internal/bridge',
    dedupeMaxEntries: Number(process.env.CANONICAL_NOTIFICATION_DEDUPE_MAX || 10000),
    baseUrl: (CONFIG.BASE_URL || process.env.SEMAPPS_HOME_URL || '').replace(/\/$/, '')
  },

  created() {
    // In-memory idempotency set. Capped at dedupeMaxEntries to prevent unbounded growth.
    this.processedIds = new Set();
  },

  async started() {
    const bearerToken = this.settings.auth.bearerToken;

    if (!bearerToken) {
      this.logger.warn('[CanonicalNotificationApi] No internal bearer token configured; all requests will be rejected');
    }

    if (!this.settings.baseUrl) {
      this.logger.warn(
        '[CanonicalNotificationApi] BASE_URL / SEMAPPS_HOME_URL is not set; bridge activity IDs will be relative'
      );
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'canonical-notification-internal',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false, limit: '256kb' } },
        onBeforeCall: (ctx, route, req) => {
          const authHeader = (req.headers.authorization || req.headers.Authorization || '').trim();
          const token = this.parseBearerToken(authHeader);
          if (!this.safeTokenEquals(bearerToken, token)) {
            throw new WebErrors.UnAuthorizedError(WebErrors.ERR_INVALID_TOKEN, null, 'Unauthorized');
          }
          // Prevent caching and information leakage
          ctx.meta.$responseHeaders = {
            ...(ctx.meta.$responseHeaders || {}),
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY'
          };
        },
        aliases: {
          'POST /canonical-notification': 'internal-bridge-canonical-notification-api.ingest'
        }
      },
      toBottom: false
    });

    this.logger.info('[CanonicalNotificationApi] Internal routes registered under /api/internal/bridge');
  },

  actions: {
    ingest: {
      async handler(ctx) {
        const params = ctx.params || {};

        // --------------- Validate required fields ---------------
        const canonicalIntentId = String(params.canonicalIntentId || '').trim();
        if (!canonicalIntentId || canonicalIntentId.length > 512) {
          throw new MoleculerError('Missing or oversized canonicalIntentId', 400, 'INVALID_INPUT');
        }

        const kind = String(params.kind || '').trim();
        if (!VALID_KINDS.has(kind)) {
          throw new MoleculerError(
            `Invalid kind: "${kind}". Must be one of: ${[...VALID_KINDS].join(', ')}`,
            400,
            'INVALID_INPUT'
          );
        }

        const sourceProtocol = String(params.sourceProtocol || '').trim();
        if (!VALID_PROTOCOLS.has(sourceProtocol)) {
          throw new MoleculerError(
            `Invalid sourceProtocol: "${sourceProtocol}". Must be one of: ${[...VALID_PROTOCOLS].join(', ')}`,
            400,
            'INVALID_INPUT'
          );
        }

        if (!params.actor || typeof params.actor !== 'object' || Array.isArray(params.actor)) {
          throw new MoleculerError('Missing or invalid actor object', 400, 'INVALID_INPUT');
        }

        const createdAt = String(params.createdAt || '').trim();
        if (!createdAt || !this.isValidIso8601(createdAt)) {
          throw new MoleculerError('Missing or invalid createdAt (must be ISO 8601)', 400, 'INVALID_INPUT');
        }

        // --------------- Idempotency check ---------------
        if (this.processedIds.has(canonicalIntentId)) {
          ctx.meta.$statusCode = 409;
          return { ok: true, duplicate: true };
        }

        // --------------- Ignore non-notification kinds early ---------------
        if (!NOTIFICATION_KINDS.has(kind)) {
          this.processedIds.add(canonicalIntentId);
          this.trimDedupeSet();
          ctx.meta.$statusCode = 202;
          return { ok: true, delivered: false, recipients: [], duplicate: false, reason: 'non-notification kind' };
        }

        // --------------- Resolve recipients and deliver ---------------
        let delivered = false;
        let deliveredRecipients = [];

        try {
          const actorUri = await this.resolveActorUri(ctx, params.actor);
          const localRecipients = await this.resolveLocalRecipients(ctx, params);

          if (localRecipients.length > 0 && actorUri) {
            deliveredRecipients = await this.deliverToLocalInboxes(ctx, params, localRecipients, actorUri);
            delivered = deliveredRecipients.length > 0;
          }
        } catch (err) {
          // Log but don't fail — the sidecar treats non-2xx as an error and won't commit offset
          this.logger.error('[CanonicalNotificationApi] Delivery error', {
            canonicalIntentId,
            kind,
            error: err?.message || String(err)
          });
        }

        // Mark as processed even if delivery partially failed, to prevent duplicate processing
        this.processedIds.add(canonicalIntentId);
        this.trimDedupeSet();

        this.logger.info('[CanonicalNotificationApi] Canonical notification processed', {
          canonicalIntentId,
          kind,
          sourceProtocol,
          delivered,
          recipientCount: deliveredRecipients.length
        });

        ctx.meta.$statusCode = 202;
        return {
          ok: true,
          delivered,
          recipients: deliveredRecipients,
          duplicate: false
        };
      }
    }
  },

  methods: {
    // ---------------------------------------------------------------------------
    // Auth helpers
    // ---------------------------------------------------------------------------

    parseBearerToken(authHeader) {
      if (!authHeader || typeof authHeader !== 'string') return null;
      // Case-insensitive Bearer scheme; single non-whitespace token value
      const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
      if (!match) return null;
      return match[1];
    },

    safeTokenEquals(expected, provided) {
      if (!expected || !provided) return false;
      const exp = Buffer.from(String(expected), 'utf8');
      const got = Buffer.from(String(provided), 'utf8');
      // Use fixed-length comparison to avoid timing oracle; pad shorter buffer to equal length
      // then AND results to ensure both conditions must hold
      const maxLen = Math.max(exp.length, got.length);
      const expPadded = Buffer.alloc(maxLen, 0);
      const gotPadded = Buffer.alloc(maxLen, 0);
      exp.copy(expPadded);
      got.copy(gotPadded);
      const lengthMatch = exp.length === got.length;
      const contentMatch = crypto.timingSafeEqual(expPadded, gotPadded);
      return lengthMatch && contentMatch;
    },

    // ---------------------------------------------------------------------------
    // Validation helpers
    // ---------------------------------------------------------------------------

    isHttpUrl(value) {
      if (!value || typeof value !== 'string') return false;
      if (value.length > MAX_URI_LENGTH) return false;
      const trimmed = value.trim();
      return trimmed.startsWith('http://') || trimmed.startsWith('https://');
    },

    isValidIso8601(value) {
      if (!value || typeof value !== 'string') return false;
      return !Number.isNaN(Date.parse(value));
    },

    // ---------------------------------------------------------------------------
    // Idempotency set management
    // ---------------------------------------------------------------------------

    trimDedupeSet() {
      const max = this.settings.dedupeMaxEntries;
      while (this.processedIds.size > max) {
        const oldest = this.processedIds.values().next().value;
        this.processedIds.delete(oldest);
      }
    },

    // ---------------------------------------------------------------------------
    // Actor URI resolution: ATProto actor → ActivityPub actor URI
    // ---------------------------------------------------------------------------

    async resolveActorUri(ctx, actorRef) {
      if (!actorRef || typeof actorRef !== 'object') return null;

      // 1. Native AP actor – use directly
      const apUri = actorRef.activityPubActorUri || actorRef.webId;
      if (apUri && this.isHttpUrl(apUri)) return apUri.trim();

      // 2. Have a DID – look up projection
      const did = typeof actorRef.did === 'string' ? actorRef.did.trim() : null;
      if (did) {
        try {
          const proj = await ctx.call('internal-identity-projection.getByDid', { atprotoDid: did });
          if (proj?.activityPubActorId && this.isHttpUrl(proj.activityPubActorId)) {
            return proj.activityPubActorId;
          }
        } catch (err) {
          this.logger.debug('[CanonicalNotificationApi] Projection lookup by DID failed', {
            did,
            error: err?.message
          });
        }
        // Fallback: canonical bsky.app profile URL for the DID (treated as remote AP actor)
        return `https://bsky.app/profile/${encodeURIComponent(did)}`;
      }

      // 3. Have a handle – look up projection
      const handle = typeof actorRef.handle === 'string' ? actorRef.handle.trim().toLowerCase() : null;
      if (handle) {
        try {
          const proj = await ctx.call('internal-identity-projection.getByHandle', {
            atprotoHandle: handle
          });
          if (proj?.activityPubActorId && this.isHttpUrl(proj.activityPubActorId)) {
            return proj.activityPubActorId;
          }
        } catch (err) {
          this.logger.debug('[CanonicalNotificationApi] Projection lookup by handle failed', {
            handle,
            error: err?.message
          });
        }
        return `https://bsky.app/profile/${encodeURIComponent(handle)}`;
      }

      // 4. canonicalAccountId fallback – cannot map to AP URI without more info
      this.logger.warn('[CanonicalNotificationApi] Could not resolve actor URI – insufficient actor ref fields', {
        actorRef
      });
      return null;
    },

    // ---------------------------------------------------------------------------
    // Local recipient resolution (kind-specific)
    // ---------------------------------------------------------------------------

    async resolveLocalRecipients(ctx, payload) {
      const kind = payload.kind;
      const candidates = new Set();

      try {
        if (kind === 'FollowAdd') {
          // subject is the CanonicalV1ActorRef of the person being followed
          const subjectRef = payload.subject;
          if (subjectRef && typeof subjectRef === 'object') {
            const subjectUri = subjectRef.activityPubActorUri || subjectRef.webId;
            if (subjectUri && this.isHttpUrl(subjectUri)) candidates.add(subjectUri.trim());
          } else if (typeof subjectRef === 'string' && this.isHttpUrl(subjectRef)) {
            // Backwards-compat: accept plain strings sent by older sidecar versions
            candidates.add(subjectRef.trim());
          }
        } else if (kind === 'ReactionAdd' || kind === 'ShareAdd') {
          // Notify the post owner. Try to find via the object's AP ID.
          const ownerUri = await this.resolveObjectOwner(ctx, payload.object);
          if (ownerUri && this.isHttpUrl(ownerUri)) candidates.add(ownerUri.trim());
        } else if (kind === 'PostCreate') {
          // Notify each mentioned AP actor
          const mentions = payload.mentions;
          if (Array.isArray(mentions)) {
            for (const m of mentions) {
              if (typeof m === 'string' && this.isHttpUrl(m) && m.length <= MAX_URI_LENGTH) {
                candidates.add(m.trim());
              }
            }
          }
        }
      } catch (err) {
        this.logger.warn('[CanonicalNotificationApi] resolveLocalRecipients error', {
          kind,
          error: err?.message || String(err)
        });
      }

      const locals = [];
      for (const actorUri of candidates) {
        try {
          const isLocal = await ctx.call('activitypub.actor.isLocal', { actorUri });
          if (isLocal) locals.push(actorUri);
        } catch (err) {
          this.logger.warn('[CanonicalNotificationApi] isLocal check failed', {
            actorUri,
            error: err?.message || String(err)
          });
        }
      }

      return locals;
    },

    // ---------------------------------------------------------------------------
    // For ReactionAdd / ShareAdd: find post owner from object reference
    // ---------------------------------------------------------------------------

    async resolveObjectOwner(ctx, objectRef) {
      if (!objectRef || typeof objectRef !== 'object') return null;

      const apId = objectRef.activityPubObjectId;
      if (!apId || !this.isHttpUrl(apId)) return null;

      try {
        const resource = await ctx.call('ldp.resource.get', {
          resourceUri: apId,
          accept: 'application/ld+json',
          webId: 'system'
        });
        if (!resource) return null;

        // Check common AP / JSON-LD attributedTo forms
        const attr =
          resource.attributedTo ||
          resource['as:attributedTo'] ||
          resource['https://www.w3.org/ns/activitystreams#attributedTo'];

        if (typeof attr === 'string' && this.isHttpUrl(attr)) return attr;
        if (attr && typeof attr === 'object') {
          const id = attr['@id'] || attr.id;
          if (typeof id === 'string' && this.isHttpUrl(id)) return id;
        }
        // Array form
        if (Array.isArray(attr)) {
          for (const a of attr) {
            if (typeof a === 'string' && this.isHttpUrl(a)) return a;
            if (a && typeof a === 'object') {
              const id = a['@id'] || a.id;
              if (typeof id === 'string' && this.isHttpUrl(id)) return id;
            }
          }
        }
      } catch (err) {
        this.logger.warn('[CanonicalNotificationApi] resolveObjectOwner failed', {
          apId,
          error: err?.message || String(err)
        });
      }

      return null;
    },

    // ---------------------------------------------------------------------------
    // Bridge activity construction
    // ---------------------------------------------------------------------------

    buildBridgeActivity(payload, recipientWebId, actorUri) {
      const { canonicalIntentId, kind, createdAt, object } = payload;
      const baseUrl = this.settings.baseUrl || 'http://localhost:3000';

      // Activity ID contains '#' so activitypub.inbox.post takes the transient path:
      // it emits activitypub.collection.added (for websocket/push delivery) without
      // attempting ldp.remote.store on an unresolvable URL.
      const activityId = `${baseUrl}/_bridge/canonical/${encodeURIComponent(canonicalIntentId)}#event`;

      const base = {
        '@context': AS_CONTEXT,
        id: activityId,
        actor: actorUri,
        published: createdAt
      };

      switch (kind) {
        case 'FollowAdd':
          // Follow: actor follows the recipient (the subject)
          return {
            ...base,
            type: 'Follow',
            object: recipientWebId,
            to: [recipientWebId]
          };

        case 'ReactionAdd': {
          const objectId = this.extractObjectId(object);
          return {
            ...base,
            type: 'Like',
            object: objectId || recipientWebId,
            to: [recipientWebId]
          };
        }

        case 'ShareAdd': {
          const objectId = this.extractObjectId(object);
          return {
            ...base,
            type: 'Announce',
            object: objectId || recipientWebId,
            to: [recipientWebId]
          };
        }

        case 'PostCreate': {
          const content =
            (payload.content && typeof payload.content === 'object'
              ? payload.content.text || payload.content.html || ''
              : '') || '';
          const noteId = `${baseUrl}/_bridge/canonical/${encodeURIComponent(canonicalIntentId)}#note`;
          const mentions = Array.isArray(payload.mentions)
            ? payload.mentions.filter(m => typeof m === 'string' && this.isHttpUrl(m))
            : [];
          return {
            ...base,
            type: 'Create',
            to: mentions.length > 0 ? mentions : [recipientWebId],
            object: {
              '@context': AS_CONTEXT,
              type: 'Note',
              id: noteId,
              attributedTo: actorUri,
              content: content.length > 8192 ? content.slice(0, 8192) : content,
              to: mentions.length > 0 ? mentions : [recipientWebId],
              tag: mentions.map(href => ({ type: 'Mention', href }))
            }
          };
        }

        default:
          // Non-delivery kind — should not reach here after NOTIFICATION_KINDS gate
          return { ...base, type: 'Note', name: `Bridge notification: ${kind}` };
      }
    },

    extractObjectId(objectRef) {
      if (!objectRef || typeof objectRef !== 'object') return null;
      const id = objectRef.activityPubObjectId || objectRef.canonicalUrl;
      return id && this.isHttpUrl(id) ? id : null;
    },

    // ---------------------------------------------------------------------------
    // Inbox delivery
    // ---------------------------------------------------------------------------

    async deliverToLocalInboxes(ctx, payload, localRecipients, actorUri) {
      const delivered = [];

      for (const recipientWebId of localRecipients) {
        try {
          // Get local actor document to find their inbox URI
          const actorDoc = await ctx.call('activitypub.actor.get', {
            actorUri: recipientWebId,
            webId: 'system'
          });

          if (!actorDoc) {
            this.logger.warn('[CanonicalNotificationApi] Local actor not found', { recipientWebId });
            continue;
          }

          const inboxUri = actorDoc.inbox;
          if (!inboxUri || !this.isHttpUrl(inboxUri)) {
            this.logger.warn('[CanonicalNotificationApi] Local actor has no resolvable inbox', {
              recipientWebId,
              inbox: inboxUri
            });
            continue;
          }

          const activity = this.buildBridgeActivity(payload, recipientWebId, actorUri);

          // Post to inbox. meta.webId = actorUri ensures the actor check in inbox.post passes.
          // skipSignatureValidation is safe here because this is an internal API call
          // from a trusted bridge service that has already authenticated with the bearer token.
          await ctx.call(
            'activitypub.inbox.post',
            { collectionUri: inboxUri, ...activity },
            { meta: { webId: actorUri, skipSignatureValidation: true } }
          );

          delivered.push(recipientWebId);

          this.logger.debug('[CanonicalNotificationApi] Delivered bridge activity to inbox', {
            recipientWebId,
            inboxUri,
            kind: payload.kind,
            actorUri
          });
        } catch (err) {
          this.logger.error('[CanonicalNotificationApi] Failed to deliver to inbox', {
            recipientWebId,
            kind: payload.kind,
            error: err?.message || String(err),
            code: err?.code,
            type: err?.type
          });
          // Continue to next recipient; partial delivery is better than none
        }
      }

      return delivered;
    }
  }
};
