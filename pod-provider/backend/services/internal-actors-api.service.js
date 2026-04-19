'use strict';

const crypto = require('crypto');
const { Errors: WebErrors } = require('moleculer-web');

module.exports = {
  name: 'internal-actors-api',

  dependencies: ['api', 'activitypub.actor', 'activitypub.collection', 'auth.account'],

  settings: {
    auth: {
      bearerToken: process.env.ACTIVITYPODS_TOKEN || process.env.INTERNAL_API_TOKEN || process.env.SIDECAR_TOKEN || ''
    },
    routePath: '/api/internal/actors'
  },

  async started() {
    const bearerToken = this.settings.auth.bearerToken;

    if (!bearerToken) {
      this.logger.warn('[InternalActorsApi] No internal bearer token configured; all requests will be rejected');
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'actors-internal',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: false },
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
            'X-Content-Type-Options': 'nosniff'
          };
        },
        aliases: {
          'GET /:identifier': 'internal-actors-api.getActorByIdentifier',
          'GET /:identifier/status-history': 'internal-actors-api.getActorStatusHistory'
        }
      },
      toBottom: false
    });

    this.logger.info('[InternalActorsApi] Internal actor routes registered under /api/internal/actors');
  },

  actions: {
    getActorByIdentifier: {
      async handler(ctx) {
        const identifier = this.getIdentifier(ctx);
        if (!identifier) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'identifier is required' };
        }

        const actor = await this.findActorByIdentifier(ctx, identifier);
        if (!actor) {
          ctx.meta.$statusCode = 404;
          return { error: 'not_found', message: `Actor not found: ${identifier}` };
        }

        ctx.meta.$statusCode = 200;
        return actor;
      }
    },

    getActorStatusHistory: {
      async handler(ctx) {
        const identifier = this.getIdentifier(ctx);
        if (!identifier) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'identifier is required' };
        }

        const actor = await this.findActorByIdentifier(ctx, identifier);
        if (!actor) {
          ctx.meta.$statusCode = 404;
          return { error: 'not_found', message: `Actor not found: ${identifier}` };
        }

        const history = actor.statusHistory;
        if (!history) {
          ctx.meta.$statusCode = 404;
          return { error: 'not_found', message: 'Status history not found' };
        }

        if (Array.isArray(history)) {
          ctx.meta.$statusCode = 200;
          return { orderedItems: history };
        }

        if (history && typeof history === 'object') {
          ctx.meta.$statusCode = 200;
          return history;
        }

        if (typeof history !== 'string' || !history.startsWith('http')) {
          ctx.meta.$statusCode = 404;
          return { error: 'not_found', message: 'Status history not found' };
        }

        try {
          const collection = await ctx.call('activitypub.collection.get', {
            resourceUri: history,
            webId: 'system'
          });

          ctx.meta.$statusCode = 200;
          return collection || { orderedItems: [] };
        } catch (error) {
          this.logger.error('[InternalActorsApi] Failed to resolve actor status history', {
            identifier,
            statusHistory: history,
            error: error.message
          });
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Failed to fetch status history' };
        }
      }
    }
  },

  methods: {
    getIdentifier(ctx) {
      const value = ctx.params?.identifier;
      const normalized = Array.isArray(value)
        ? String(value[0] || '').trim()
        : value == null
          ? ''
          : String(value).trim();

      if (!normalized) return '';
      if (!/^[a-zA-Z0-9._-]{1,128}$/.test(normalized)) {
        return '';
      }

      return normalized;
    },

    async findActorByIdentifier(ctx, identifier) {
      try {
        const account = await ctx.call('auth.account.findByUsername', { username: identifier });
        if (!account?.webId) return null;

        const actor = await ctx.call('activitypub.actor.get', {
          actorUri: account.webId,
          webId: 'system'
        });
        return actor || null;
      } catch {
        return null;
      }
    },

    parseBearerToken(authHeader) {
      if (!authHeader || typeof authHeader !== 'string') return null;
      const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
      if (!match) return null;
      return match[1];
    },

    safeTokenEquals(expected, provided) {
      if (!expected || !provided) return false;
      const exp = Buffer.from(String(expected), 'utf8');
      const got = Buffer.from(String(provided), 'utf8');
      const maxLen = Math.max(exp.length, got.length);
      const expPadded = Buffer.alloc(maxLen, 0);
      const gotPadded = Buffer.alloc(maxLen, 0);
      exp.copy(expPadded);
      got.copy(gotPadded);
      const lengthMatch = exp.length === got.length;
      const contentMatch = crypto.timingSafeEqual(expPadded, gotPadded);
      return lengthMatch && contentMatch;
    }
  }
};
