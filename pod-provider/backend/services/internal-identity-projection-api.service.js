const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;
const { Errors: WebErrors } = require('moleculer-web');

module.exports = {
  name: 'internal-identity-projection-api',
  dependencies: ['api', 'internal-identity-projection', 'internal-identity-changes'],

  settings: {
    auth: {
      bearerToken:
        process.env.ACTIVITYPODS_TOKEN ||
        process.env.INTERNAL_API_TOKEN ||
        process.env.SIDECAR_TOKEN ||
        ''
    },
    routePath: '/api/internal/identity'
  },

  async started() {
    const bearerToken = this.settings.auth.bearerToken;

    if (!bearerToken) {
      this.logger.warn('[IdentityProjectionApi] No internal bearer token configured; all requests will be rejected');
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'identity-internal',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: false },
        onBeforeCall: (ctx, route, req) => {
          const authHeader = req.headers.authorization || req.headers.Authorization || '';
          const token = this.parseBearerToken(authHeader);
          if (!this.safeTokenEquals(bearerToken, token)) {
            throw new WebErrors.UnAuthorizedError(
              WebErrors.ERR_INVALID_TOKEN,
              null,
              'Unauthorized'
            );
          }
        },
        aliases: {
          'GET /by-canonical-account-id': 'internal-identity-projection-api.getByCanonicalAccountId',
          'GET /by-did': 'internal-identity-projection-api.getByDid',
          'GET /by-handle': 'internal-identity-projection-api.getByHandle',
          'GET /changes': 'internal-identity-projection-api.getChanges'
        }
      },
      toBottom: false
    });

    this.logger.info('[IdentityProjectionApi] Internal identity routes registered under /api/internal/identity');
  },

  actions: {
    getByCanonicalAccountId: {
      async handler(ctx) {
        this.setNoStoreHeaders(ctx);

        const canonicalAccountId = this.getQueryValue(ctx, 'canonicalAccountId', 4096);
        if (!canonicalAccountId) {
          throw new MoleculerError('Missing canonicalAccountId', 400, 'INVALID_INPUT');
        }

        const projection = await ctx.call('internal-identity-projection.getByCanonicalAccountId', {
          canonicalAccountId
        });

        return this.respondWithProjectionOr404(ctx, projection);
      }
    },

    getByDid: {
      async handler(ctx) {
        this.setNoStoreHeaders(ctx);

        const atprotoDid = this.getQueryValue(ctx, 'did', 512);
        if (!atprotoDid) {
          throw new MoleculerError('Missing did', 400, 'INVALID_INPUT');
        }

        const projection = await ctx.call('internal-identity-projection.getByDid', {
          atprotoDid
        });

        return this.respondWithProjectionOr404(ctx, projection);
      }
    },

    getByHandle: {
      async handler(ctx) {
        this.setNoStoreHeaders(ctx);

        const atprotoHandle = this.getQueryValue(ctx, 'handle', 253);
        if (!atprotoHandle) {
          throw new MoleculerError('Missing handle', 400, 'INVALID_INPUT');
        }

        const projection = await ctx.call('internal-identity-projection.getByHandle', {
          atprotoHandle: atprotoHandle.toLowerCase()
        });

        return this.respondWithProjectionOr404(ctx, projection);
      }
    },

    getChanges: {
      async handler(ctx) {
        this.setNoStoreHeaders(ctx);

        const since = this.getOptionalQueryValue(ctx, 'since', 2048);
        const limitRaw = this.getOptionalQueryValue(ctx, 'limit', 16);
        const limit = limitRaw ? Number(limitRaw) : 100;

        if (!Number.isInteger(limit) || limit <= 0 || limit > 500) {
          throw new MoleculerError('Invalid limit', 400, 'INVALID_INPUT');
        }

        return ctx.call('internal-identity-changes.listChanges', {
          since,
          limit
        });
      }
    }
  },

  methods: {
    parseBearerToken(authHeader) {
      if (!authHeader || typeof authHeader !== 'string') return null;
      const [scheme, token] = authHeader.split(' ');
      if (scheme !== 'Bearer' || !token) return null;
      return token.trim();
    },

    safeTokenEquals(expected, provided) {
      if (!expected || !provided) return false;
      const expectedBuffer = Buffer.from(String(expected), 'utf8');
      const providedBuffer = Buffer.from(String(provided), 'utf8');
      if (expectedBuffer.length !== providedBuffer.length) return false;
      return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
    },

    setNoStoreHeaders(ctx) {
      ctx.meta.$responseHeaders = {
        ...(ctx.meta.$responseHeaders || {}),
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      };
    },

    getOptionalQueryValue(ctx, key, maxLength) {
      const value = ctx.params?.[key];
      const normalized = Array.isArray(value)
        ? String(value[0] || '').trim()
        : value === null || value === undefined
          ? ''
          : String(value).trim();

      if (!normalized) return '';
      if (normalized.length > maxLength) {
        throw new MoleculerError(`Query parameter "${key}" is too long`, 400, 'INVALID_INPUT');
      }

      return normalized;
    },

    getQueryValue(ctx, key, maxLength) {
      return this.getOptionalQueryValue(ctx, key, maxLength);
    },

    respondWithProjectionOr404(ctx, projection) {
      if (projection) {
        return projection;
      }

      ctx.meta.$statusCode = 404;
      return {
        error: 'not_found',
        message: 'Identity projection not found'
      };
    }
  }
};
