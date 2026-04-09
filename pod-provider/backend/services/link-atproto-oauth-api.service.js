const Redis = require('ioredis');
const fetch = require('node-fetch');
const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;
const { randomToken, sanitizeErrorMessage, parseBoolean, assertHttpsUrl } = require('../utils/oauth-security');
const { generateKeyPair, exportJWK, importJWK, SignJWT, calculateJwkThumbprint } = require('jose');

function normalizeLoopbackRedirectUri(rawUrl) {
  const parsed = new URL(String(rawUrl));
  if (parsed.hostname === 'localhost') {
    parsed.hostname = '127.0.0.1';
  }
  return parsed.toString();
}

const defaultRedirectUri = normalizeLoopbackRedirectUri(
  process.env.LINK_ATPROTO_OAUTH_REDIRECT_URI ||
    `${(process.env.SEMAPPS_HOME_URL || 'http://localhost:3000').replace(/\/$/, '')}/api/accounts/link-atproto/oauth/callback`
);
const defaultScope = process.env.LINK_ATPROTO_OAUTH_SCOPE || 'atproto';
const defaultClientId =
  process.env.LINK_ATPROTO_OAUTH_CLIENT_ID ||
  `http://localhost/?redirect_uri=${encodeURIComponent(defaultRedirectUri)}&scope=${encodeURIComponent(defaultScope)}`;

/**
 * Generate an ES256 DPoP key pair.
 * Returns { privateKeyJwk (string), publicKeyJwk (object), thumbprint (string) }.
 */
async function generateDpopKeypair() {
  const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = await exportJWK(publicKey);
  const thumbprint = await calculateJwkThumbprint(publicJwk);
  privateJwk.kid = thumbprint;
  publicJwk.kid = thumbprint;
  return {
    privateKeyJwk: JSON.stringify(privateJwk),
    publicKeyJwk: publicJwk,
    thumbprint
  };
}

/**
 * Build a DPoP proof JWT (RFC 9449) for a single request.
 * @param {string} privateKeyJwkStr - JSON-serialized ES256 private JWK
 * @param {string} htu - Target URL without query string
 * @param {string} htm - HTTP method (uppercase)
 * @param {string} [nonce] - Optional server-issued nonce
 */
async function buildDpopProof(privateKeyJwkStr, htu, htm, nonce) {
  const privateJwk = JSON.parse(privateKeyJwkStr);
  const privateKey = await importJWK(privateJwk, 'ES256');
  const { d: _d, ...publicJwk } = privateJwk;

  const payload = {
    jti: crypto.randomBytes(16).toString('hex'),
    htm: htm.toUpperCase(),
    htu,
    iat: Math.floor(Date.now() / 1000)
  };

  if (nonce) {
    payload.nonce = nonce;
  }

  return new SignJWT(payload).setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk: publicJwk }).sign(privateKey);
}

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
  const cap = Math.min(250 * 2 ** Math.max(0, attempt - 1), 5000);
  return Math.floor(Math.random() * cap);
}

module.exports = {
  name: 'link-atproto-oauth-api',
  dependencies: ['api', 'atproto-verification', 'atproto-linking'],

  settings: {
    redisUrl: process.env.SEMAPPS_REDIS_CACHE_URL || 'redis://localhost:6379',
    stateKeyPrefix: 'oauth:link-atproto:state',
    stateTtlSec: Math.max(60, Math.min(Number(process.env.LINK_ATPROTO_OAUTH_STATE_TTL_SECONDS) || 600, 1800)),
    allowHttpLocalhost: parseBoolean(
      process.env.LINK_ATPROTO_OAUTH_ALLOW_HTTP_LOCALHOST,
      process.env.NODE_ENV !== 'production'
    ),
    clientId: defaultClientId,
    redirectUri: defaultRedirectUri,
    scope: defaultScope,
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
          ctx.meta.$remoteIp =
            req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.connection?.remoteAddress || '';
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
        const codeVerifier = randomToken(48);
        const codeChallenge = asBase64UrlSha256(codeVerifier);

        // Generate a fresh DPoP key pair for this session.  The private key is
        // stored in the OAuth state so the callback can use it for the token
        // exchange, and then persisted alongside the access/refresh tokens so
        // the sidecar can make DPoP-bound XRPC calls.
        const dpopKeypair = await generateDpopKeypair();

        const record = {
          state,
          codeVerifier,
          createdAt: Date.now(),
          pdsUrl,
          issuer: metadata.issuer,
          tokenEndpoint: metadata.token_endpoint,
          dpopPrivateKeyJwk: dpopKeypair.privateKeyJwk,
          activitypods: ctx.params.activitypods,
          atproto: {
            pdsUrl,
            identifier: ctx.params.atproto.identifier || undefined,
            did: ctx.params.atproto.did || undefined,
            handle: ctx.params.atproto.handle || undefined
          },
          redirectAfterLink: ctx.params.redirectAfterLink || undefined
        };

        await this.redis.set(this.stateKey(state), JSON.stringify(record), 'EX', this.settings.stateTtlSec);

        const pushedAuthorization = await this.createPushedAuthorizationRequest({
          metadata,
          state,
          codeChallenge,
          dpopPrivateKeyJwk: dpopKeypair.privateKeyJwk,
          identifier: record.atproto.identifier || undefined
        });

        const authorizeUrl = new URL(String(metadata.authorization_endpoint));
        authorizeUrl.searchParams.set('client_id', this.settings.clientId);
        authorizeUrl.searchParams.set('request_uri', pushedAuthorization.request_uri);

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
        iss: { type: 'string', optional: true },
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

        const issuer = String(ctx.params.iss || '').trim();
        if (record.issuer && issuer && issuer !== record.issuer) {
          throw new MoleculerError('OAuth issuer mismatch', 400, 'ATPROTO_OAUTH_ISSUER_MISMATCH');
        }

        const tokenPayload = await this.exchangeCodeForToken({
          tokenEndpoint: record.tokenEndpoint,
          code,
          codeVerifier: record.codeVerifier,
          dpopPrivateKeyJwk: record.dpopPrivateKeyJwk
        });

        const subjectDid = String(tokenPayload.sub || '').trim();
        const accessToken = String(tokenPayload.access_token || '').trim();
        const grantedScope = String(tokenPayload.scope || '').trim();

        if (!subjectDid) {
          throw new MoleculerError('Token endpoint did not return sub', 502, 'ATPROTO_OAUTH_TOKEN_FAILED');
        }

        if (!grantedScope || !grantedScope.split(/\s+/).includes('atproto')) {
          throw new MoleculerError('Token endpoint did not grant atproto scope', 502, 'ATPROTO_OAUTH_TOKEN_FAILED');
        }

        if (!accessToken) {
          throw new MoleculerError('Token endpoint did not return access_token', 502, 'ATPROTO_OAUTH_TOKEN_FAILED');
        }

        const verifiedAtproto = await ctx.call('atproto-verification.verifyDelegatedIdentity', {
          pdsUrl: record.pdsUrl,
          accessToken,
          subjectDid,
          did: record.atproto.did,
          handle: record.atproto.handle
        });

        const linked = await ctx.call('atproto-linking.linkExternalAccount', {
          activitypods: record.activitypods,
          verifiedAtproto: {
            ...verifiedAtproto,
            // Pass DPoP context so the sidecar can store it with the session
            dpopPrivateKeyJwk: record.dpopPrivateKeyJwk || undefined,
            tokenEndpoint: record.tokenEndpoint || undefined
          }
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
        parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1';

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
      let authorizationServerOrigin = pdsUrl;
      let protectedResourceBody = null;

      const protectedResourceUrl = new URL('/.well-known/oauth-protected-resource', pdsUrl).toString();
      try {
        protectedResourceBody = await this.fetchJsonWithRetry(
          protectedResourceUrl,
          {
            method: 'GET',
            headers: {
              accept: 'application/json'
            }
          },
          {
            acceptedErrorStatuses: [404]
          }
        );
      } catch (error) {
        if (!(error instanceof MoleculerError) || error.type !== 'ATPROTO_OAUTH_UPSTREAM_INVALID') {
          throw error;
        }
      }

      const authorizationServers = Array.isArray(protectedResourceBody?.authorization_servers)
        ? protectedResourceBody.authorization_servers.filter(
            value => typeof value === 'string' && value.trim().length > 0
          )
        : [];

      if (authorizationServers.length > 0) {
        authorizationServerOrigin = String(authorizationServers[0]).trim().replace(/\/$/, '');
      }

      const metadataUrl = new URL('/.well-known/oauth-authorization-server', authorizationServerOrigin).toString();
      const body = await this.fetchJsonWithRetry(metadataUrl, {
        method: 'GET',
        headers: {
          accept: 'application/json'
        }
      });

      if (!body || typeof body !== 'object') {
        throw new MoleculerError('OAuth metadata response is invalid', 502, 'ATPROTO_OAUTH_DISCOVERY_FAILED');
      }

      const issuer = String(body.issuer || '').trim();
      const authorizationEndpoint = String(body.authorization_endpoint || '').trim();
      const tokenEndpoint = String(body.token_endpoint || '').trim();
      const pushedAuthorizationRequestEndpoint = String(body.pushed_authorization_request_endpoint || '').trim();

      if (!issuer || !authorizationEndpoint || !tokenEndpoint || !pushedAuthorizationRequestEndpoint) {
        throw new MoleculerError('OAuth metadata is missing required endpoints', 502, 'ATPROTO_OAUTH_DISCOVERY_FAILED');
      }

      assertHttpsUrl(issuer, {
        allowLocalhostHttp: this.settings.allowHttpLocalhost,
        field: 'issuer'
      });
      assertHttpsUrl(authorizationEndpoint, {
        allowLocalhostHttp: this.settings.allowHttpLocalhost,
        field: 'authorization_endpoint'
      });
      assertHttpsUrl(tokenEndpoint, {
        allowLocalhostHttp: this.settings.allowHttpLocalhost,
        field: 'token_endpoint'
      });
      assertHttpsUrl(pushedAuthorizationRequestEndpoint, {
        allowLocalhostHttp: this.settings.allowHttpLocalhost,
        field: 'pushed_authorization_request_endpoint'
      });

      return {
        issuer,
        authorization_endpoint: authorizationEndpoint,
        token_endpoint: tokenEndpoint,
        pushed_authorization_request_endpoint: pushedAuthorizationRequestEndpoint
      };
    },

    async createPushedAuthorizationRequest({ metadata, state, codeChallenge, dpopPrivateKeyJwk, identifier }) {
      const body = await this.fetchJsonWithDpopNonceRetry(
        metadata.pushed_authorization_request_endpoint,
        {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded'
          },
          body: withFormUrlEncoded({
            client_id: this.settings.clientId,
            redirect_uri: this.settings.redirectUri,
            response_type: 'code',
            scope: this.settings.scope,
            state,
            code_challenge: codeChallenge,
            code_challenge_method: 'S256',
            ...(identifier ? { login_hint: identifier } : {})
          })
        },
        {
          dpopPrivateKeyJwk,
          acceptedErrorStatuses: [400, 401]
        }
      );

      if (body.error) {
        throw new MoleculerError(
          sanitizeErrorMessage(body.error_description || body.error),
          400,
          'ATPROTO_OAUTH_PAR_FAILED'
        );
      }

      const requestUri = String(body.request_uri || '').trim();
      if (!requestUri) {
        throw new MoleculerError('PAR response is missing request_uri', 502, 'ATPROTO_OAUTH_PAR_FAILED');
      }

      return {
        request_uri: requestUri
      };
    },

    async exchangeCodeForToken({ tokenEndpoint, code, codeVerifier, dpopPrivateKeyJwk }) {
      const body = await this.fetchJsonWithDpopNonceRetry(
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
          dpopPrivateKeyJwk,
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

    async fetchJsonWithDpopNonceRetry(url, options, extra = {}) {
      const method = String(options.method || 'GET').toUpperCase();
      const htu = String(url).split('?')[0];
      let nonce;

      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const headers = {
          ...(options.headers || {})
        };

        if (extra.dpopPrivateKeyJwk) {
          headers.DPoP = await buildDpopProof(extra.dpopPrivateKeyJwk, htu, method, nonce);
        }

        const response = await this.fetchJsonResponseWithRetry(url, {
          ...options,
          headers
        });

        if (
          extra.dpopPrivateKeyJwk &&
          (response.status === 400 || response.status === 401) &&
          String(response.body?.error || '').trim() === 'use_dpop_nonce' &&
          response.headers['dpop-nonce'] &&
          attempt < 2
        ) {
          nonce = response.headers['dpop-nonce'];
          continue;
        }

        if (response.ok) {
          return response.body;
        }

        if (extra.acceptedErrorStatuses && extra.acceptedErrorStatuses.includes(response.status)) {
          return response.body;
        }

        throw new MoleculerError(
          sanitizeErrorMessage(`Upstream OAuth request failed with status ${response.status}`),
          502,
          'ATPROTO_OAUTH_UPSTREAM_FAILED',
          { status: response.status }
        );
      }

      throw new MoleculerError('OAuth DPoP nonce retry failed', 502, 'ATPROTO_OAUTH_UPSTREAM_FAILED');
    },

    async fetchJsonWithRetry(url, options, extra = {}) {
      const response = await this.fetchJsonResponseWithRetry(url, options);

      if (response.ok) {
        return response.body;
      }

      if (extra.acceptedErrorStatuses && extra.acceptedErrorStatuses.includes(response.status)) {
        return response.body;
      }

      throw new MoleculerError(
        sanitizeErrorMessage(`Upstream OAuth request failed with status ${response.status}`),
        502,
        'ATPROTO_OAUTH_UPSTREAM_FAILED',
        { status: response.status }
      );
    },

    async fetchJsonResponseWithRetry(url, options) {
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

          const headers = {};
          for (const [key, value] of response.headers.entries()) {
            headers[String(key).toLowerCase()] = value;
          }

          if (response.ok) {
            return {
              ok: true,
              status: response.status,
              headers,
              body: json
            };
          }

          if (isRetryableStatus(response.status) && attempt < this.settings.maxAttempts) {
            await sleep(randomBackoffMs(attempt));
            continue;
          }

          return {
            ok: false,
            status: response.status,
            headers,
            body: json
          };
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
