const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;
const { Errors: WebErrors } = require('moleculer-web');

const RECIPIENT_FIELDS = ['to', 'cc', 'bto', 'bcc'];

// Limit concurrent remote actor resolution to avoid overwhelming the remote-fetch pool
const MAX_CONCURRENT_RESOLUTIONS = 10;

module.exports = {
  name: 'internal-activitypub-bridge-api',

  dependencies: ['api', 'activitypub.actor'],

  settings: {
    auth: {
      bearerToken:
        process.env.ACTIVITYPODS_TOKEN ||
        process.env.INTERNAL_API_TOKEN ||
        process.env.SIDECAR_TOKEN ||
        ''
    },
    routePath: '/api/internal/activitypub-bridge',
    maxRecipientUris: Number(process.env.AP_BRIDGE_MAX_RECIPIENT_URIS || 1000),
    maxDeliveries: Number(process.env.AP_BRIDGE_MAX_DELIVERIES || 500)
  },

  async started() {
    const bearerToken = this.settings.auth.bearerToken;

    if (!bearerToken) {
      this.logger.warn('[ActivityPubBridgeApi] No internal bearer token configured; all requests will be rejected');
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'activitypub-bridge-internal',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false, limit: '512kb' } },
        onBeforeCall: (ctx, route, req) => {
          const authHeader = (req.headers.authorization || req.headers.Authorization || '').trim();
          const token = this.parseBearerToken(authHeader);
          if (!this.safeTokenEquals(bearerToken, token)) {
            throw new WebErrors.UnAuthorizedError(WebErrors.ERR_INVALID_TOKEN, null, 'Unauthorized');
          }
          ctx.meta.$responseHeaders = {
            ...(ctx.meta.$responseHeaders || {}),
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY'
          };
        },
        aliases: {
          'POST /resolve-outbound': 'internal-activitypub-bridge-api.resolveOutbound'
        }
      },
      toBottom: false
    });

    this.logger.info('[ActivityPubBridgeApi] Internal routes registered under /api/internal/activitypub-bridge');
  },

  actions: {
    resolveOutbound: {
      async handler(ctx) {
        const actorUri = this.normalizeAbsoluteUrl(ctx.params?.actorUri, 'actorUri');
        const activity = ctx.params?.activity;

        if (!actorUri) {
          throw new MoleculerError('Missing actorUri', 400, 'INVALID_INPUT');
        }
        if (!activity || typeof activity !== 'object' || Array.isArray(activity)) {
          throw new MoleculerError('Missing activity object', 400, 'INVALID_INPUT');
        }

        const recipientUris = this.extractRecipientUris(activity);
        const deliveries = await this.resolveRemoteDeliveries(ctx, recipientUris);

        return {
          actorUri,
          deliveries,
          resolvedAt: new Date().toISOString()
        };
      }
    }
  },

  methods: {
    parseBearerToken(authHeader) {
      if (!authHeader || typeof authHeader !== 'string') return null;
      // Case-insensitive scheme matching; single non-whitespace token value
      const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
      if (!match) return null;
      return match[1];
    },

    safeTokenEquals(expected, provided) {
      if (!expected || !provided) return false;
      const exp = Buffer.from(String(expected), 'utf8');
      const got = Buffer.from(String(provided), 'utf8');
      // Pad to equal length, then compare both length and content in constant time
      const maxLen = Math.max(exp.length, got.length);
      const expPadded = Buffer.alloc(maxLen, 0);
      const gotPadded = Buffer.alloc(maxLen, 0);
      exp.copy(expPadded);
      got.copy(gotPadded);
      const lengthMatch = exp.length === got.length;
      const contentMatch = crypto.timingSafeEqual(expPadded, gotPadded);
      return lengthMatch && contentMatch;
    },

    normalizeAbsoluteUrl(value, fieldName) {
      const normalized = String(value || '').trim();
      if (!normalized) return '';
      let parsed;
      try {
        parsed = new URL(normalized);
      } catch {
        throw new MoleculerError(`Invalid ${fieldName} URL`, 400, 'INVALID_INPUT');
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new MoleculerError(`Invalid ${fieldName} protocol`, 400, 'INVALID_INPUT');
      }
      return parsed.toString();
    },

    extractRecipientUris(activity) {
      const values = new Set();

      for (const field of RECIPIENT_FIELDS) {
        const raw = activity?.[field];
        if (!raw) continue;

        const array = Array.isArray(raw) ? raw : [raw];
        for (const value of array) {
          if (typeof value !== 'string') continue;
          const trimmed = value.trim();
          if (!trimmed) continue;
          if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) continue;
          values.add(trimmed);
          if (values.size >= this.settings.maxRecipientUris) {
            throw new MoleculerError('Too many recipient URIs in activity', 400, 'INVALID_INPUT');
          }
        }
      }

      return [...values];
    },

    async resolveRemoteDeliveries(ctx, recipientUris) {
      const grouped = new Map();

      // Process in bounded concurrent batches to avoid overwhelming the actor-fetch pool
      for (let i = 0; i < recipientUris.length; i += MAX_CONCURRENT_RESOLUTIONS) {
        const batch = recipientUris.slice(i, i + MAX_CONCURRENT_RESOLUTIONS);

        await Promise.all(batch.map(async recipientUri => {
          try {
            const isLocal = await ctx.call('activitypub.actor.isLocal', { actorUri: recipientUri });
            if (isLocal) return;

            const actorDoc = await ctx.call('activitypub.actor.get', { actorUri: recipientUri });
            if (!actorDoc) return;

            const rawInbox = actorDoc.endpoints?.sharedInbox || actorDoc.inbox;
            if (!rawInbox) return;

            const inbox = this.normalizeAbsoluteUrl(rawInbox, 'recipient inbox');
            if (!inbox) return;

            const targetDomain = new URL(inbox).hostname;
            const sharedInbox = this.normalizeOptionalAbsoluteUrl(actorDoc.endpoints?.sharedInbox);
            const key = sharedInbox || inbox;

            const bucket = grouped.get(key) || {
              actor: recipientUri,
              targetDomain,
              recipients: new Set(),
              sharedInbox: sharedInbox || undefined
            };
            bucket.recipients.add(inbox);
            grouped.set(key, bucket);
          } catch (error) {
            this.logger.warn('[ActivityPubBridgeApi] Failed to resolve recipient', {
              recipientUri,
              error: error?.message || String(error)
            });
          }
        }));
      }

      const deliveries = [];
      for (const item of grouped.values()) {
        deliveries.push({
          actor: item.actor,
          targetDomain: item.targetDomain,
          recipients: [...item.recipients],
          sharedInbox: item.sharedInbox
        });
      }

      if (deliveries.length > this.settings.maxDeliveries) {
        throw new MoleculerError('Resolved delivery set is too large', 413, 'TOO_MANY_DELIVERIES');
      }

      return deliveries;
    },

    normalizeOptionalAbsoluteUrl(value) {
      if (!value) return undefined;
      try {
        return this.normalizeAbsoluteUrl(value, 'url');
      } catch {
        return undefined;
      }
    }
  }
};
