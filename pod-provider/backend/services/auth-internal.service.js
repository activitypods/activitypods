const { Errors } = require('moleculer');

const { MoleculerError } = Errors;

module.exports = {
  name: 'auth-internal',
  dependencies: ['api', 'auth.account'],

  settings: {
    auth: {
      bearerToken: process.env.ACTIVITYPODS_TOKEN || ''
    }
  },

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        name: 'auth-internal',
        path: '/api/internal/auth',
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false } },
        onBeforeCall(ctx, route, req) {
          ctx.meta.$headers = req.headers;
        },
        aliases: {
          'POST /verify': 'auth-internal.verify'
        }
      },
      toBottom: false
    });

    this.logger.info('[AuthInternal] Internal auth routes registered under /api/internal/auth');
  },

  actions: {
    verify: {
      rest: {
        method: 'POST',
        path: '/api/internal/auth/verify'
      },
      params: {
        canonicalAccountId: { type: 'string', min: 1 },
        password: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        this._auth(ctx);

        const { canonicalAccountId, password } = ctx.params;
        const account = await ctx.call('auth.account.findByWebId', { webId: canonicalAccountId });

        if (!account) {
          ctx.meta.$statusCode = 404;
          return { ok: false, reason: 'account_not_found' };
        }

        try {
          await ctx.call('auth.account.verify', {
            username: account.username,
            password
          });

          return {
            ok: true,
            scope: 'full'
          };
        } catch (error) {
          ctx.meta.$statusCode = 401;
          return { ok: false, reason: 'invalid_password' };
        }
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
    }
  }
};