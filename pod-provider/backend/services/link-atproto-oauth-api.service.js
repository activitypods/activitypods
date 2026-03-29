const Redis = require('ioredis');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;
const { randomToken, sanitizeErrorMessage, parseBoolean, assertHttpsUrl } = require('../utils/oauth-security');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function asBase64UrlSha256(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('base64url');
}

function withFormUrlEncoded(body) {
  return new URLSearchParams(body).toString();
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function randomBackoffMs(attempt) {
  const cap = Math.min(250 * (2 ** Math.max(0, attempt - 1)), 5000);
  return Math.floor(Math.random() * cap);
}

module.exports = {
  name: 'link-atproto-oauth-api',
  dependencies: ['api', 'atproto-verification', 'atproto-linking'],

  settings: {
    redisUrl: process.env.SEMAPPS_REDIS_CACHE_URL || 'redis://localhost:6379',
    stateKeyPrefix: 'oauth:link-atproto:state',
    stateTtlSec: Math.max(60, Math.min(Number(process.env.LINK_ATPROTO_OAUTH_STATE_TTL_SECONDS) || 600, 1800)),
    allowHttpLocalhost: parseBoolean(process.env.LINK_ATPROTO_OAUTH_ALLOW_HTTP_LOCALHOST, process.env.NODE_ENV !== 'production'),
    clientId: process.env.LINK_ATPROTO_OAUTH_CLIENT_ID || 'http://localhost:3901/memory-pwa.client.json',
    redirectUri:
      process.env.LINK_ATPROTO_OAUTH_REDIRECT_URI ||
      `${(process.env.SEMAPPS_HOME_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/accounts/link-atproto/oauth/callback`,
    scope: process.env.LINK_ATPROTO_OAUTH_SCOPE || 'atproto',
    timeoutMs: Math.max(1000, Math.min(Number(process.env.LINK_ATPROTO_OAUTH_TIMEOUT_MS) || 8000, 15000)),
    maxAttempts: Math.max(1, Math.min(Number(process.env.LINK_ATPROTO_OAUTH_MAX_ATTEMPTS) || 5, 5))
  },

  created() {
    this.redis = new Redis(this.settings.redisUrl);
  },

  async stopped() {
    if (this.redis) {
      await this.redis.quit().catch(() => this.redis.disconnect());
    }
  },

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        name: 'link-atproto-oauth-api',
        path: '/api/accounts/link-atproto/oauth',
        authorization: false,
        authentication: false,
        bodyParsers: {
          json: { strict: false },
          urlencoded: { extended: false }
        },
        onBeforeCall: (ctx, route, req) => {
          ctx.meta.$headers = req.headers;
          ctx.meta.$query = req.query;
          ctx.meta.$remoteIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.connection?.remoteAddress || '';
        },
        aliases: {
          'POST /start': 'link-atproto-oauth-api.start',
          'GET /callback': 'link-atproto-oauth-api.callback'
        }
      },
      toBottom: false
    });

    this.logger.info('[LinkAtprotoOAuthApi] Routes registered under /api/accounts/link-atproto/oauth');
  },

  actions: {
    start: {
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
            identifier: { type: 'string', optional: true },
            did: { type: 'string', optional: true },
            handle: { type: 'string', optional: true }
          }
        },
        redirectAfterLink: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const pdsUrl = this.normalizePdsUrl(ctx.params.atproto.pdsUrl);
        const metadata = await this.discoverOAuthMetadata(pdsUrl);

        const state = randomToken(24);
        const nonce = randomToken(24);
        const codeVerifier = randomToken(48);
        const codeChallenge = asBase64UrlSha256(codeVerifier);

        const record = {
          state,
          nonce,
          codeVerifier,
          createdAt: Date.now(),
          pdsUrl,
          tokenEndpoint: metadata.token_endpoint,
          activitypods: ctx.params.activitypods,
          atproto: {
            pdsUrl,
            identifier: ctx.params.atproto.identifier || undefined,
            did: ctx.params.atproto.did || undefined,
            handle: ctx.params.atproto.handle || undefined
          },
          redirectAfterLink: ctx.params.redirectAfterLink || undefined
        };

        await this.redis.set(
          this.stateKey(state),
          JSON.stringify(record),
          'EX',
          this.settings.stateTtlSec
        );

        const authorizeUrl = new URL(String(metadata.authorization_endpoint));
        authorizeUrl.searchParams.set('response_type', 'code');
        authorizeUrl.searchParams.set('client_id', this.settings.clientId);
        authorizeUrl.searchParams.set('redirect_uri', this.settings.redirectUri);
        authorizeUrl.searchParams.set('scope', this.settings.scope);
        authorizeUrl.searchParams.set('state', state);
        authorizeUrl.searchParams.set('code_challenge', codeChallenge);
        authorizeUrl.searchParams.set('code_challenge_method', 'S256');
        authorizeUrl.searchParams.set('nonce', nonce);
        if (record.atproto.identifier) {
          authorizeUrl.searchParams.set('login_hint', record.atproto.identifier);
        }

        return {
          authorizationUrl: authorizeUrl.toString(),
          state,
          expiresIn: this.settings.stateTtlSec
        };
      }
    },

    callback: {
      params: {
        state: 'string|min:8',
        code: { type: 'string', optional: true },
        error: { type: 'string', optional: true },
        error_description: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const state = String(ctx.params.state || '').trim();
        const error = String(ctx.params.error || '').trim();
        if (error) {
          throw new MoleculerError(
            sanitizeErrorMessage(ctx.params.error_description || error),
            400,
            'ATPROTO_OAUTH_AUTHORIZATION_FAILED'
          );
        }

        const code = String(ctx.params.code || '').trim();
        if (!code) {
          throw new MoleculerError('Missing authorization code', 400, 'INVALID_REQUEST');
        }

        const record = await this.consumeState(state);
        if (!record) {
          throw new MoleculerError('OAuth state is invalid or expired', 400, 'INVALID_REQUEST');
        }

        const tokenPayload = await this.exchangeCodeForToken({
          tokenEndpoint: record.tokenEndpoint,
          code,
          codeVerifier: record.codeVerifier
        });

        const accessToken = String(tokenPayload.access_token || '').trim();
        if (!accessToken) {
          throw new MoleculerError('Token endpoint did not return access_token', 502, 'ATPROTO_OAUTH_TOKEN_FAILED');
        }

        const verifiedAtproto = await ctx.call('atproto-verification.verifyDelegatedIdentity', {
          pdsUrl: record.pdsUrl,
          accessToken,
          did: record.atproto.did,
          handle: record.atproto.handle
        });

        const linked = await ctx.call('atproto-linking.linkExternalAccount', {
          activitypods: record.activitypods,
          verifiedAtproto
        });

        if (record.redirectAfterLink) {
          const redirect = new URL(record.redirectAfterLink);
          redirect.searchParams.set('linked', '1');
          redirect.searchParams.set('did', linked.atproto?.did || '');
          ctx.meta.$statusCode = 302;
          ctx.meta.$location = redirect.toString();
          return { redirect: redirect.toString() };
        }

        return {
          delegated: true,
          linked
        };
      }
    }
  },

  methods: {
    normalizePdsUrl(rawUrl) {
      let parsed;
      try {
        parsed = new URL(String(rawUrl || '').trim());
      } catch (_error) {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_PDS_URL_INVALID');
      }

      if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_PDS_URL_INVALID');
      }

      const isLocalhost =
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1';

      const schemeAllowed =
        parsed.protocol === 'https:' ||
        (this.settings.allowHttpLocalhost && isLocalhost && parsed.protocol === 'http:');

      if (!schemeAllowed) {
        throw new MoleculerError('PDS URL must use HTTPS', 400, 'ATPROTO_PDS_URL_INVALID');
      }

      return parsed.origin;
    },

    stateKey(state) {
      return `${this.settings.stateKeyPrefix}:${state}`;
    },

    async consumeState(state) {
      const key = this.stateKey(state);
      const raw = await this.redis.get(key);
      if (!raw) return null;
      await this.redis.del(key);
      return JSON.parse(raw);
    },

    async discoverOAuthMetadata(pdsUrl) {
      const metadataUrl = new URL('/.well-known/oauth-authorization-server', pdsUrl).toString();
      const body = await this.fetchJsonWithRetry(metadataUrl, {
        method: 'GET',
        headers: {
          accept: 'application/json'
        }
      });

      if (!body || typeof body !== 'object') {
        throw new MoleculerError('OAuth metadata response is invalid', 502, 'ATPROTO_OAUTH_DISCOVERY_FAILED');
      }

      const authorizationEndpoint = String(body.authorization_endpoint || '').trim();
      const tokenEndpoint = String(body.token_endpoint || '').trim();
      if (!authorizationEndpoint || !tokenEndpoint) {
        throw new MoleculerError('OAuth metadata is missing required endpoints', 502, 'ATPROTO_OAUTH_DISCOVERY_FAILED');
      }

      assertHttpsUrl(authorizationEndpoint, {
        allowLocalhostHttp: this.settings.allowHttpLocalhost,
        field: 'authorization_endpoint'
      });
      assertHttpsUrl(tokenEndpoint, {
        allowLocalhostHttp: this.settings.allowHttpLocalhost,
        field: 'token_endpoint'
      });

      return {
        authorization_endpoint: authorizationEndpoint,
        token_endpoint: tokenEndpoint
      };
    },

    async exchangeCodeForToken({ tokenEndpoint, code, codeVerifier }) {
      const body = await this.fetchJsonWithRetry(
        tokenEndpoint,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded'
          },
          body: withFormUrlEncoded({
            grant_type: 'authorization_code',
            code,
            redirect_uri: this.settings.redirectUri,
            client_id: this.settings.clientId,
            code_verifier: codeVerifier
          })
        },
        {
          acceptedErrorStatuses: [400, 401, 403]
        }
      );

      if (body.error) {
        throw new MoleculerError(
          sanitizeErrorMessage(body.error_description || body.error),
          400,
          'ATPROTO_OAUTH_TOKEN_FAILED'
        );
      }

      return body;
    },

    async fetchJsonWithRetry(url, options, extra = {}) {
      let lastError = null;

      for (let attempt = 1; attempt <= this.settings.maxAttempts; attempt += 1) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);

          const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            redirect: 'error'
          });
          clearTimeout(timer);

          const text = await response.text();
          let json;
          try {
            json = text ? JSON.parse(text) : {};
          } catch (_error) {
            throw new MoleculerError('Upstream response is not valid JSON', 502, 'ATPROTO_OAUTH_UPSTREAM_INVALID');
          }

          if (response.ok) {
            return json;
          }

          if (extra.acceptedErrorStatuses && extra.acceptedErrorStatuses.includes(response.status)) {
            return json;
          }

          if (isRetryableStatus(response.status) && attempt < this.settings.maxAttempts) {
            await sleep(randomBackoffMs(attempt));
            continue;
          }

          throw new MoleculerError(
            sanitizeErrorMessage(`Upstream OAuth request failed with status ${response.status}`),
            502,
            'ATPROTO_OAUTH_UPSTREAM_FAILED',
            { status: response.status }
          );
        } catch (error) {
          lastError = error;
          if (attempt >= this.settings.maxAttempts) {
            break;
          }
          await sleep(randomBackoffMs(attempt));
        }
      }

      if (lastError instanceof MoleculerError) {
        throw lastError;
      }

      throw new MoleculerError(
        sanitizeErrorMessage(lastError?.message || 'OAuth request failed'),
        502,
        'ATPROTO_OAUTH_UPSTREAM_FAILED'
      );
    }
  }
};
