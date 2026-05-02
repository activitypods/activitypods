'use strict';

/**
 * Internal MLS Keys API
 *
 * Provides a bearer-token-protected internal REST endpoint that the Fedify
 * sidecar calls to retrieve an actor's active MLS KeyPackage list when serving
 * GET /users/:identifier/keyPackages.
 *
 * Route registered under /api/internal/mls-keys:
 *
 *   GET /key-packages?actorIdentifier={id}
 *     → { items: [{ id, cipherSuite, publicBytes, createdAt }] }
 *     Returns only active, public KeyPackage data (no private key material).
 *
 * The bearer token must match ACTIVITYPODS_TOKEN (same secret used by all
 * internal sidecar → backend APIs).
 */

const crypto = require('crypto');
const { Errors: WebErrors } = require('moleculer-web');

module.exports = {
  name: 'internal-mls-keys-api',

  dependencies: ['api', 'mls.keys', 'auth.account', 'activitypub.actor'],

  settings: {
    auth: {
      bearerToken: process.env.ACTIVITYPODS_TOKEN || process.env.INTERNAL_API_TOKEN || process.env.SIDECAR_TOKEN || ''
    },
    routePath: '/api/internal/mls-keys'
  },

  async started() {
    const bearerToken = this.settings.auth.bearerToken;

    if (!bearerToken) {
      this.logger.warn('[MlsKeysApi] No internal bearer token configured; all requests will be rejected');
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'mls-keys-internal',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false, limit: '16kb' } },
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
          'GET /key-packages': 'internal-mls-keys-api.getKeyPackages',
          'POST /submit': 'internal-mls-keys-api.submitKeyPackage'
        }
      },
      toBottom: false
    });

    this.logger.info('[MlsKeysApi] Internal routes registered under /api/internal/mls-keys: key-packages, submit');
  },

  actions: {
    // =========================================================================
    // GET /key-packages?actorIdentifier={id}
    // =========================================================================

    getKeyPackages: {
      async handler(ctx) {
        const actorIdentifier = String(
          ctx.params?.actorIdentifier ?? ctx.meta.queryString?.actorIdentifier ?? ''
        ).trim();

        if (!actorIdentifier) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'actorIdentifier is required' };
        }

        const actor = await this.findActorByIdentifier(ctx, actorIdentifier);
        if (!actor) {
          ctx.meta.$statusCode = 404;
          return { error: 'not_found', message: `Actor not found: ${actorIdentifier}` };
        }

        const actorUri = actor.id || actor['@id'];
        if (!actorUri) {
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Actor URI could not be resolved' };
        }

        let items;
        try {
          items = await ctx.call('mls.keys.list', { actorUri });
        } catch (err) {
          this.logger.error('[MlsKeysApi] failed to list key packages', {
            actorIdentifier,
            actorUri,
            error: err instanceof Error ? err.message : String(err)
          });
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Failed to retrieve key packages' };
        }

        this.logger.debug('[MlsKeysApi] getKeyPackages', {
          actorIdentifier,
          itemCount: items.length
        });

        ctx.meta.$statusCode = 200;
        return { items };
      }
    },

    // =========================================================================
    // POST /submit
    // Body: { actorIdentifier, cipherSuite, content }
    // Stores a client-submitted public KeyPackage (no private key on server).
    // =========================================================================

    submitKeyPackage: {
      async handler(ctx) {
        const body = ctx.params ?? {};

        const actorIdentifier = typeof body.actorIdentifier === 'string' ? body.actorIdentifier.trim() : '';
        const cipherSuite = typeof body.cipherSuite === 'string' ? body.cipherSuite.trim() : '';
        const content = typeof body.content === 'string' ? body.content.trim() : '';

        if (!actorIdentifier) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'actorIdentifier is required' };
        }
        if (!cipherSuite) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'cipherSuite is required' };
        }
        if (!content) {
          ctx.meta.$statusCode = 400;
          return { error: 'invalid_request', message: 'content (base64 KeyPackage bytes) is required' };
        }

        const actor = await this.findActorByIdentifier(ctx, actorIdentifier);
        if (!actor) {
          ctx.meta.$statusCode = 404;
          return { error: 'not_found', message: `Actor not found: ${actorIdentifier}` };
        }

        const actorUri = actor.id || actor['@id'];
        if (!actorUri) {
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Actor URI could not be resolved' };
        }

        let result;
        try {
          result = await ctx.call('mls.keys.submit', {
            actorUri,
            cipherSuite,
            publicBytes: content
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          // Surface validation errors as 400
          if (/required|base64|size|exceed/i.test(msg)) {
            ctx.meta.$statusCode = 400;
            return { error: 'invalid_request', message: msg };
          }
          this.logger.error('[MlsKeysApi] failed to submit key package', {
            actorIdentifier,
            error: msg
          });
          ctx.meta.$statusCode = 500;
          return { error: 'internal_error', message: 'Failed to store key package' };
        }

        this.logger.debug('[MlsKeysApi] key package submitted', {
          actorIdentifier,
          id: result.id,
          cipherSuite
        });

        ctx.meta.$statusCode = 201;
        return { id: result.id, cipherSuite: result.cipherSuite };
      }
    }
  },

  methods: {
    async findActorByIdentifier(ctx, identifier) {
      try {
        const account = await ctx.call('auth.account.findByUsername', {
          username: identifier
        });
        if (!account?.webId) return null;
        const actor = await ctx.call('activitypub.actor.get', {
          actorUri: account.webId
        });
        return actor || null;
      } catch {
        return null;
      }
    },

    parseBearerToken(authHeader) {
      if (!authHeader || typeof authHeader !== 'string') return '';
      const lower = authHeader.toLowerCase();
      if (!lower.startsWith('bearer ')) return '';
      return authHeader.slice(7).trim();
    },

    safeTokenEquals(expected, provided) {
      if (!expected || !provided) return false;
      if (typeof expected !== 'string' || typeof provided !== 'string') return false;
      if (expected.length === 0 || provided.length === 0) return false;
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(provided, 'utf8');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    }
  }
};
