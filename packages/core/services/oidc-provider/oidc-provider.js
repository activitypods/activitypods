const Redis = require('ioredis');
const RedisAdapter = require('./adapter');
const config = require('./config');
const fetch = require('node-fetch');

module.exports = {
  name: 'oidc-provider',
  settings: {
    baseUrl: undefined,
    redisUrl: undefined
  },
  async started() {
    // Dynamically import Provider since it's an ESM module
    const { default: Provider } = await import('oidc-provider');

    this.client = new Redis(this.settings.redisUrl, { keyPrefix: 'oidc:' });

    // Solid OIDC requires pkce https://solid.github.io/solid-oidc/#concepts
    config.pkce = {
      methods: ['S256'],
      required: () => true
    };

    // Default client settings that might not be defined.
    // Mostly relevant for WebID clients.
    // config.clientDefaults = {
    //   id_token_signed_response_alg: key.alg,
    // };

    config.cookies = {
      ...config.cookies,
      keys: ['cookie-secret']
    };

    // See https://github.com/CommunitySolidServer/CommunitySolidServer/blob/15a929a87e4ce00c0ed266e296405c8e4a22d4a7/src/identity/configuration/CachedJwkGenerator.ts
    // import { exportJWK, generateKeyPair, importJWK } from 'jose';
    // const { privateKey } = await generateKeyPair('ES256');
    // const privateJwk = { ...await exportJWK(privateKey) };
    // privateJwk.alg = 'ES256';

    config.jwks = {
      keys: [
        {
          d: 'VEZOsY07JTFzGTqv6cC2Y32vsfChind2I_TTuvV225_-0zrSej3XLRg8iE_u0-3GSgiGi4WImmTwmEgLo4Qp3uEcxCYbt4NMJC7fwT2i3dfRZjtZ4yJwFl0SIj8TgfQ8ptwZbFZUlcHGXZIr4nL8GXyQT0CK8wy4COfmymHrrUoyfZA154ql_OsoiupSUCRcKVvZj2JHL2KILsq_sh_l7g2dqAN8D7jYfJ58MkqlknBMa2-zi5I0-1JUOwztVNml_zGrp27UbEU60RqV3GHjoqwI6m01U7K0a8Q_SQAKYGqgepbAYOA-P4_TLl5KC4-WWBZu_rVfwgSENwWNEhw8oQ',
          dp: 'E1Y-SN4bQqX7kP-bNgZ_gEv-pixJ5F_EGocHKfS56jtzRqQdTurrk4jIVpI-ZITA88lWAHxjD-OaoJUh9Jupd_lwD5Si80PyVxOMI2xaGQiF0lbKJfD38Sh8frRpgelZVaK_gm834B6SLfxKdNsP04DsJqGKktODF_fZeaGFPH0',
          dq: 'F90JPxevQYOlAgEH0TUt1-3_hyxY6cfPRU2HQBaahyWrtCWpaOzenKZnvGFZdg-BuLVKjCchq3G_70OLE-XDP_ol0UTJmDTT-WyuJQdEMpt_WFF9yJGoeIu8yohfeLatU-67ukjghJ0s9CBzNE_LrGEV6Cup3FXywpSYZAV3iqc',
          e: 'AQAB',
          kty: 'RSA',
          n: 'xwQ72P9z9OYshiQ-ntDYaPnnfwG6u9JAdLMZ5o0dmjlcyrvwQRdoFIKPnO65Q8mh6F_LDSxjxa2Yzo_wdjhbPZLjfUJXgCzm54cClXzT5twzo7lzoAfaJlkTsoZc2HFWqmcri0BuzmTFLZx2Q7wYBm0pXHmQKF0V-C1O6NWfd4mfBhbM-I1tHYSpAMgarSm22WDMDx-WWI7TEzy2QhaBVaENW9BKaKkJklocAZCxk18WhR0fckIGiWiSM5FcU1PY2jfGsTmX505Ub7P5Dz75Ygqrutd5tFrcqyPAtPTFDk8X1InxkkUwpP3nFU5o50DGhwQolGYKPGtQ-ZtmbOfcWQ',
          p: '5wC6nY6Ev5FqcLPCqn9fC6R9KUuBej6NaAVOKW7GXiOJAq2WrileGKfMc9kIny20zW3uWkRLm-O-3Yzze1zFpxmqvsvCxZ5ERVZ6leiNXSu3tez71ZZwp0O9gys4knjrI-9w46l_vFuRtjL6XEeFfHEZFaNJpz-lcnb3w0okrbM',
          q: '3I1qeEDslZFB8iNfpKAdWtz_Wzm6-jayT_V6aIvhvMj5mnU-Xpj75zLPQSGa9wunMlOoZW9w1wDO1FVuDhwzeOJaTm-Ds0MezeC4U6nVGyyDHb4CUA3ml2tzt4yLrqGYMT7XbADSvuWYADHw79OFjEi4T3s3tJymhaBvy1ulv8M',
          qi: 'wSbXte9PcPtr788e713KHQ4waE26CzoXx-JNOgN0iqJMN6C4_XJEX-cSvCZDf4rh7xpXN6SGLVd5ibIyDJi7bbi5EQ5AXjazPbLBjRthcGXsIuZ3AtQyR0CEWNSdM7EyM5TRdyZQ9kftfz9nI03guW3iKKASETqX2vh0Z8XRjyU',
          use: 'sig'
        }
      ]
    };

    config.adapter = name => {
      console.log('init adapter', name);
      return new RedisAdapter(name, this.client);
    };

    config.interactions = {
      url: async (ctx, interaction) => {
        console.log('interaction', interaction);
        return `/interaction/${interaction.uid}`;
      }
    };

    // See https://github.com/panva/node-oidc-provider/blob/main/recipes/client_based_origins.md
    config.clientBasedCORS = (ctx, origin, client) => {
      console.log('origin, client', origin, client);
      return true;
    };

    // config.routes = {
    //   authorization: '/.oidc/oauth/auth',
    //   backchannel_authentication: '/.oidc/oauth/backchannel',
    //   code_verification: '/.oidc/oauth/device',
    //   device_authorization: '/.oidc/oauth/device/auth',
    //   end_session: '/.oidc/oauth/session/end',
    //   introspection: '/.oidc/oauth/token/introspection',
    //   jwks: '/.oidc/oauth/jwks',
    //   pushed_authorization_request: '/.oidc/oauth/request',
    //   registration: '/.oidc/oauth/reg',
    //   revocation: '/.oidc/oauth/token/revocation',
    //   token: '/.oidc/oauth/token',
    //   userinfo: '/.oidc/oauth/me'
    // };

    config.renderError = async (ctx, out, error) => {
      console.log('out', out);
      console.error(error);
      ctx.type = 'html';
      ctx.body = `
        <!DOCTYPE html>
        <head>
          <title>oops! something went wrong</title>
        </head>
        <body>
          <div>
            <h1>oops! something went wrong</h1>
            ${Object.entries(out)
              .map(([key, value]) => `<pre><strong>${key}</strong>: ${value}</pre>`)
              .join('')}
          </div>
        </body>
        </html>
      `;
    };

    const oidc = new Provider(this.settings.baseUrl, config);

    // Allow provider to interpret reverse proxy headers.
    oidc.proxy = true;

    const oidcMiddleware = oidc.callback();

    await this.broker.call('api.addRoute', {
      route: {
        path: '/.well-known/openid-configuration',
        aliases: {
          'GET /': 'oidc-provider.proxyConfig'
        }
      }
    });

    await this.broker.call('api.addRoute', {
      route: {
        path: '/.oidc/auth',
        use: [oidcMiddleware]
      }
    });
  },
  actions: {
    async proxyConfig() {
      const res = await fetch(`${this.settings.baseUrl}.oidc/auth/.well-known/openid-configuration`);
      if (res.ok) {
        return await res.json();
      } else {
        throw new Error('Not found');
      }
    }
  }
};
