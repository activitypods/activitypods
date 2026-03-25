const { MoleculerError } = require('moleculer').Errors;

module.exports = {
  name: 'internal-identity-projection-api',
  dependencies: ['api', 'internal-identity-projection'],

  settings: {
    auth: {
      bearerToken:
        process.env.ACTIVITYPODS_TOKEN ||
        process.env.SIDECAR_TOKEN ||
        process.env.INTERNAL_API_TOKEN ||
        ''
    }
  },

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        name: 'identity-internal',
        path: '/api/internal/identity',
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false } },
        onBeforeCall(ctx, route, req) {
          ctx.meta.$headers = req.headers;
        },
        aliases: {
          'GET /by-canonical-account-id': 'internal-identity-projection-api.getByCanonicalAccountId',
          'GET /by-did': 'internal-identity-projection-api.getByDid',
          'GET /by-handle': 'internal-identity-projection-api.getByHandle'
        }
      }
    });

    this.logger.info('[IdentityProjectionApi] Internal identity projection routes registered under /api/internal/identity');
  },

  actions: {
    getByCanonicalAccountId: {
      async handler(ctx) {
        this._auth(ctx);

        const canonicalAccountId = this._getQueryValue(ctx, 'canonicalAccountId');
        if (!canonicalAccountId) {
          throw new MoleculerError('Missing canonicalAccountId', 400, 'INVALID_INPUT');
        }

        const projection = await ctx.call('internal-identity-projection.getByCanonicalAccountId', {
          canonicalAccountId
        });

        if (!projection) {
          ctx.meta.$statusCode = 404;
          return { error: 'not_found' };
        }

        return projection;
      }
    },

    getByDid: {
      async handler(ctx) {
        this._auth(ctx);

        const atprotoDid = this._getQueryValue(ctx, 'did');
        if (!atprotoDid) {
          throw new MoleculerError('Missing did', 400, 'INVALID_INPUT');
        }

        const projection = await ctx.call('internal-identity-projection.getByDid', {
          atprotoDid
        });

        if (!projection) {
          ctx.meta.$statusCode = 404;
          return { error: 'not_found' };
        }

        return projection;
      }
    },

    getByHandle: {
      async handler(ctx) {
        this._auth(ctx);

        const atprotoHandle = this._getQueryValue(ctx, 'handle');
        if (!atprotoHandle) {
          throw new MoleculerError('Missing handle', 400, 'INVALID_INPUT');
        }

        const projection = await ctx.call('internal-identity-projection.getByHandle', {
          atprotoHandle: atprotoHandle.toLowerCase()
        });

        if (!projection) {
          ctx.meta.$statusCode = 404;
          return { error: 'not_found' };
        }

        return projection;
      }
    }
  },

  methods: {
    _auth(ctx) {
      const auth = ctx.meta?.$headers?.authorization || ctx.meta?.$headers?.Authorization;
      if (!auth || !String(auth).startsWith('Bearer ')) {
        throw new MoleculerError('Missing bearer token', 401, 'AUTH_FAILED');
      }

      const token = String(auth).slice(7);
      if (!this.settings.auth.bearerToken || token !== this.settings.auth.bearerToken) {
        throw new MoleculerError('Invalid bearer token', 403, 'AUTH_FAILED');
      }
    },

    _getQueryValue(ctx, key) {
      const value = ctx.params?.[key];
      if (Array.isArray(value)) return String(value[0] || '').trim();
      if (value === null || value === undefined) return '';
      return String(value).trim();
    }
  }
};
