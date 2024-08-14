const path = require('path');
const Redis = require('ioredis');
const { delay } = require('@semapps/ldp');
const { Errors: E } = require('moleculer-web');
const RedisAdapter = require('./adapter');
const baseConfig = require('./base-config');
const fetch = require('node-fetch');

module.exports = {
  name: 'oidc-provider',
  settings: {
    baseUrl: undefined,
    frontendUrl: undefined,
    redisUrl: undefined,
    cookieSecret: 'COOKIE-SECRET'
  },
  dependencies: ['jwk', 'api'],
  async started() {
    // Dynamically import Provider since it's an ESM module
    const { default: Provider } = await import('oidc-provider');

    const { privateJwk } = await this.broker.call('jwk.get');

    const config = baseConfig(this.settings, privateJwk);

    const redisClient = new Redis(this.settings.redisUrl, { keyPrefix: 'oidc:' });
    config.adapter = name => new RedisAdapter(name, redisClient);

    // See https://github.com/panva/node-oidc-provider/blob/main/recipes/client_based_origins.md
    config.clientBasedCORS = (ctx, origin, client) => {
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
          'GET /': 'oidc-provider.proxyConfig'
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
          'POST /': 'oidc-provider.loginCompleted'
        }
      }
    });

    await this.broker.call('api.addRoute', {
      route: {
        name: 'oidc-consent-completed',
        path: path.join(basePath, '/.oidc/consent-completed'),
        bodyParsers: {
          json: true
        },
        aliases: {
          'POST /': 'oidc-provider.consentCompleted'
        }
      }
    });

    // The OIDC provider route must be added after all other routes, otherwise it gets overwritten
    // TODO find out why ! Probably due to the fact it is only a middleware (adding dummy aliases doesn't help)
    await delay(10000);

    await this.broker.call('api.addRoute', {
      route: {
        name: 'oidc-provider',
        path: path.join(basePath, '/.oidc/auth'),
        use: [this.oidc.callback()]
      }
    });
  },
  actions: {
    // See https://moleculer.services/docs/0.13/moleculer-web.html#Authentication
    async authenticate(ctx) {
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
    },
    // See https://moleculer.services/docs/0.13/moleculer-web.html#Authorization
    async authorize(ctx) {
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
    },
    async proxyConfig() {
      const res = await fetch(`${this.settings.baseUrl}.oidc/auth/.well-known/openid-configuration`);
      if (res.ok) {
        return await res.json();
      } else {
        throw new Error('OIDC server not loaded');
      }
    },
    // See https://github.com/panva/node-oidc-provider/blob/main/docs/README.md#user-flows
    async loginCompleted(ctx) {
      const { interactionId } = ctx.params;
      const webId = ctx.meta.webId;

      await this.interactionFinished(interactionId, {
        login: { accountId: webId, amr: ['pwd'], remember: true }
      });
    },
    // See https://github.com/panva/node-oidc-provider/blob/main/docs/README.md#user-flows
    async consentCompleted(ctx) {
      const { interactionId } = ctx.params;
      const interaction = await this.oidc.Interaction.find(interactionId);

      if (interaction) {
        const clientId = interaction.params?.client_id;
        const accountId = interaction.session?.accountId;
        const scope = interaction.params?.scope;

        // Grant the requested scope (should be "webid openid")
        const grant = new this.oidc.Grant({ accountId, clientId });
        grant.addOIDCScope(scope);
        const grantId = await grant.save();

        await this.interactionFinished(interactionId, {
          consent: { grantId }
        });
      } else {
        throw new Error(`No interaction found with ID ${interactionId}`);
      }
    }
  },
  methods: {
    async interactionFinished(interactionId, result) {
      const interaction = await this.oidc.Interaction.find(interactionId);
      if (interaction) {
        interaction.result = result;
        await interaction.save(interaction.exp - Math.floor(Date.now() / 1000));
      } else {
        throw new Error(`No interaction found with ID ${interactionId}`);
      }
    }
  }
};
