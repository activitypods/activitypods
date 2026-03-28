const { Errors } = require('moleculer');

const { MoleculerError } = Errors;

module.exports = {
  name: 'link-atproto-api',
  dependencies: ['api', 'atproto-verification', 'atproto-linking'],

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        path: '/api/accounts',
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false } },
        aliases: {
          'POST /link-atproto': 'link-atproto-api.link'
        }
      },
      toBottom: false
    });

    this.logger.info('[LinkAtprotoApi] Route POST /api/accounts/link-atproto registered');
  },

  actions: {
    link: {
      params: {
        activitypods: {
          type: 'object',
          props: {
            canonicalAccountId: { type: 'string', optional: true },
            username: { type: 'string', optional: true },
            email: { type: 'string', optional: true },
            password: 'string|min:8',
            profile: {
              type: 'object',
              optional: true,
              props: {
                displayName: { type: 'string', optional: true },
                summary: { type: 'string', optional: true }
              }
            }
          }
        },
        atproto: {
          type: 'object',
          props: {
            pdsUrl: 'string|min:1',
            identifier: 'string|min:1',
            password: 'string|min:1',
            did: { type: 'string', optional: true },
            handle: { type: 'string', optional: true }
          }
        }
      },
      async handler(ctx) {
        this.setSensitiveResponseHeaders(ctx);

        try {
          const verifiedAtproto = await ctx.call('atproto-verification.verifyLinkableIdentity', {
            pdsUrl: ctx.params.atproto.pdsUrl,
            identifier: ctx.params.atproto.identifier,
            password: ctx.params.atproto.password,
            did: ctx.params.atproto.did,
            handle: ctx.params.atproto.handle
          });

          const result = await ctx.call('atproto-linking.linkExternalAccount', {
            activitypods: ctx.params.activitypods,
            verifiedAtproto
          });

          ctx.meta.$statusCode = ctx.params.activitypods.canonicalAccountId ? 200 : 201;
          return result;
        } catch (error) {
          const statusCode = Number.isFinite(Number(error.code)) ? Number(error.code) : 500;
          const type = typeof error.type === 'string' ? error.type : 'ATPROTO_LINK_FAILED';
          const message = this.sanitizeErrorMessage(error.message || 'Unable to link external ATProto account');

          throw new MoleculerError(message, statusCode, type);
        }
      }
    }
  },

  methods: {
    setSensitiveResponseHeaders(ctx) {
      ctx.meta.$responseHeaders = {
        ...(ctx.meta.$responseHeaders || {}),
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      };
    },

    sanitizeErrorMessage(message) {
      return String(message || 'Unable to link external ATProto account')
        .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
        .replace(/(accessJwt|refreshJwt|password)\s*[:=]\s*["'][^"']+["']/gi, '$1:[redacted]');
    }
  }
};
