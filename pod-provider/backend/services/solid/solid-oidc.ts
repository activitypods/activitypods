import path from 'path';
import Redis from 'ioredis';
import { delay } from '@semapps/ldp';
import { Errors as E } from 'moleculer-web';
import RedisAdapter from '../../config/oidc-adapter.ts';
import baseConfig from '../../config/oidc.ts';
import fetch from 'node-fetch';
import CONFIG from '../../config/config.ts';
import { ServiceSchema, defineAction } from 'moleculer';

const SolidOidcSchema = {
  name: 'solid-oidc' as const,
  settings: {
    baseUrl: CONFIG.BASE_URL,
    frontendUrl: CONFIG.FRONTEND_URL,
    redisUrl: CONFIG.REDIS_OIDC_PROVIDER_URL,
    cookieSecret: CONFIG.COOKIE_SECRET
  },
  dependencies: ['jwk', 'api'],
  async started() {
    // Dynamically import Provider since it's an ESM module
    const { default: Provider } = await import('oidc-provider');

    const { privateJwk } = await this.broker.call('jwk.get');

    const config = baseConfig(this.settings, privateJwk);

    const redisClient = new Redis(this.settings.redisUrl, { keyPrefix: 'oidc:' });
    config.adapter = (name: any) => new RedisAdapter(name, redisClient);

    // See https://github.com/panva/node-oidc-provider/blob/main/recipes/client_based_origins.md
    config.clientBasedCORS = (ctx: any, origin: any, client: any) => {
      // TODO validate CORS based on client
      return true;
    };

    this.oidc = new Provider(this.settings.baseUrl, config);

    // Allow provider to interpret reverse proxy headers.
    this.oidc.proxy = true;

    await this.broker.call('api.addRoute', {
      route: {
        name: 'oidc-config',
        path: '/.well-known/openid-configuration',
        aliases: {
          'GET /': 'solid-oidc.proxyConfig'
        }
      }
    });

    const { pathname: basePath } = new URL(this.settings.baseUrl);

    await this.broker.call('api.addRoute', {
      route: {
        name: 'oidc-login-completed',
        path: path.join(basePath, '/.oidc/login-completed'),
        authentication: true,
        bodyParsers: {
          json: true
        },
        aliases: {
          'POST /': 'solid-oidc.loginCompleted'
        }
      }
    });

    // The OIDC provider route must be added after all other routes, otherwise it gets overwritten
    // TODO find out why ! Probably due to the fact it is only a middleware (adding dummy aliases doesn't help)
    await delay(10000);

    await this.broker.call('api.addRoute', {
      route: {
        name: 'solid-oidc',
        path: path.join(basePath, '/.oidc/auth'),
        use: [this.oidc.callback()]
      }
    });
  },
  actions: {
    authenticate: defineAction({
      // See https://moleculer.services/docs/0.13/moleculer-web.html#Authentication
      async handler(ctx) {
        const { route, req, res } = ctx.params;
        // Extract token from authorization header (do not take the Bearer part)
        const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
        if (token) {
          const payload = await ctx.call('jwk.verifyToken', { token });
          if (payload) {
            ctx.meta.tokenPayload = payload;
            ctx.meta.webId = payload.azp; // Use the WebID of the application requesting access
            ctx.meta.impersonatedUser = payload.webid; // Used by some services which need to know the real user (Attention: webid with a i)
            return Promise.resolve(payload);
          }
          // Invalid token
          ctx.meta.webId = 'anon';
          return Promise.reject(new E.UnAuthorizedError(E.ERR_INVALID_TOKEN));
        }
        // No token
        ctx.meta.webId = 'anon';
        return Promise.resolve(null);
      }
    }),

    authorize: defineAction({
      // See https://moleculer.services/docs/0.13/moleculer-web.html#Authorization
      async handler(ctx) {
        const { route, req, res } = ctx.params;
        // Extract token from authorization header (do not take the Bearer part)
        const token = req.headers.authorization && req.headers.authorization.split(' ')[1];
        if (token) {
          const payload = await ctx.call('jwk.verifyToken', { token });
          if (payload) {
            ctx.meta.tokenPayload = payload;
            ctx.meta.webId = payload.azp; // Use the WebID of the application requesting access
            ctx.meta.impersonatedUser = payload.webid; // Used by some services which need to know the real user (Attention: webid with a i)
            return Promise.resolve(payload);
          }
          ctx.meta.webId = 'anon';
          return Promise.reject(new E.UnAuthorizedError(E.ERR_INVALID_TOKEN));
        }
        ctx.meta.webId = 'anon';
        return Promise.reject(new E.UnAuthorizedError(E.ERR_NO_TOKEN));
      }
    }),

    proxyConfig: defineAction({
      async handler() {
        const res = await fetch(`${this.settings.baseUrl}.oidc/auth/.well-known/openid-configuration`);
        if (res.ok) {
          return await res.json();
        } else {
          throw new Error('OIDC server not loaded');
        }
      }
    }),

    loginCompleted: defineAction({
      // See https://github.com/panva/node-oidc-provider/blob/main/docs/README.md#user-flows
      async handler(ctx) {
        const { interactionId } = ctx.params;
        const webId = ctx.meta.webId;

        await this.interactionFinished(interactionId, {
          login: { accountId: webId, amr: ['pwd'], remember: true }
        });
      }
    })
  },
  methods: {
    async interactionFinished(interactionId, result) {
      const interaction = await this.oidc.Interaction.find(interactionId);
      if (interaction) {
        interaction.result = result;
        await interaction.save(interaction.exp - Math.floor(Date.now() / 1000));
      } else {
        throw new Error(`No interaction found with ID ${interactionId}. It may have expired.`);
      }
    }
  }
} satisfies ServiceSchema;

export default SolidOidcSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [SolidOidcSchema.name]: typeof SolidOidcSchema;
    }
  }
}
