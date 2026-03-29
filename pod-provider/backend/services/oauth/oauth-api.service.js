const { MoleculerError } = require('moleculer').Errors;
const { sanitizeErrorMessage, parseBoolean } = require('../../utils/oauth-security');
const CONFIG = require('../../config/config');

const baseUrl = process.env.SEMAPPS_HOME_URL || CONFIG.BASE_URL || '';

module.exports = {
  name: 'oauth-api',
  dependencies: [
    'api',
    'auth.jwt',
    'oauth-authorization-server-metadata',
    'oauth-protected-resource-metadata',
    'oauth-client-metadata',
    'oauth-dpop-nonce',
    'oauth-par',
    'oauth-authorization',
    'oauth-consent-challenge',
    'oauth-token',
    'oauth-refresh-session'
  ],

  settings: {
    auth: {
      internalBearerToken: process.env.ACTIVITYPODS_TOKEN || ''
    },
    issuer: process.env.OAUTH_ISSUER || baseUrl,
    csrfCookieName: process.env.OAUTH_CSRF_COOKIE_NAME || 'oauth_csrf',
    allowInternalAuthorizeFallback: parseBoolean(
      process.env.OAUTH_ALLOW_INTERNAL_AUTHORIZE_FALLBACK,
      process.env.NODE_ENV !== 'production'
    )
  },

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        name: 'oauth-well-known',
        path: '/.well-known',
        authorization: false,
        authentication: false,
        onBeforeCall: (ctx, route, req) => {
          ctx.meta.$headers = req.headers;
          ctx.meta.$query = req.query;
          ctx.meta.$remoteIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.connection?.remoteAddress || '';
        },
        aliases: {
          'GET /oauth-authorization-server': 'oauth-api.getAuthorizationServerMetadata',
          'GET /oauth-protected-resource': 'oauth-api.getProtectedResourceMetadata'
        }
      },
      toBottom: false
    });

    await this.broker.call('api.addRoute', {
      route: {
        name: 'oauth-public',
        path: '/oauth',
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false } },
        onBeforeCall: (ctx, route, req) => {
          ctx.meta.$headers = req.headers;
          ctx.meta.$query = req.query;
          ctx.meta.$remoteIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.connection?.remoteAddress || '';
        },
        aliases: {
          'POST /par': 'oauth-api.createPar',
          'GET /authorize': 'oauth-api.getAuthorize',
          'POST /authorize': 'oauth-api.postAuthorizeUser',
          'POST /token': 'oauth-api.exchangeToken',
          'POST /revoke': 'oauth-api.revoke',
          'GET /client-metadata/:id': 'oauth-api.getClientMetadata',
          'GET /dpop-nonce': 'oauth-api.getDpopNonce'
        }
      },
      toBottom: false
    });

    await this.broker.call('api.addRoute', {
      route: {
        name: 'oauth-internal',
        path: '/api/internal/oauth',
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false } },
        onBeforeCall: (ctx, route, req) => {
          ctx.meta.$headers = req.headers;
          ctx.meta.$remoteIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.connection?.remoteAddress || '';
        },
        aliases: {
          'POST /authorize': 'oauth-api.postAuthorizeInternal',
          'POST /introspect': 'oauth-api.introspect',
          'POST /revoke-family': 'oauth-api.revokeFamily',
          'GET /health': 'oauth-api.health'
        }
      },
      toBottom: false
    });

    this.logger.info('[OAuthApi] OAuth routes registered');
  },

  actions: {
    async getAuthorizationServerMetadata(ctx) {
      this.noStore(ctx);
      return this.runSafely(() => ctx.call('oauth-authorization-server-metadata.getMetadata'));
    },

    async getProtectedResourceMetadata(ctx) {
      this.noStore(ctx);
      return this.runSafely(() => ctx.call('oauth-protected-resource-metadata.getMetadata'));
    },

    async createPar(ctx) {
      this.noStore(ctx);
      const body = this.body(ctx);
      const proof = this.getDpopHeader(ctx);
      const nonce = this.getDpopNonceHeader(ctx);

      const verified = await this.runSafely(() =>
        ctx.call('oauth-dpop-nonce.verifyProof', {
          proofJwt: proof,
          htm: 'POST',
          htu: this.oauthEndpoint('/oauth/par'),
          audience: this.settings.issuer,
          nonce
        })
      );

      ctx.meta.$statusCode = 201;
      return this.runSafely(() =>
        ctx.call('oauth-par.create', {
          ...body,
          dpop_jkt: verified.jkt
        })
      );
    },

    async getAuthorize(ctx) {
      this.noStore(ctx);
      const query = ctx.meta.$query || {};
      const context = await this.runSafely(() =>
        ctx.call('oauth-authorization.getAuthorizationContext', {
          request_uri: query.request_uri
        })
      );

      const csrfToken = this.randomToken();
      const challenge = await this.runSafely(() =>
        ctx.call('oauth-consent-challenge.mint', {
          requestUri: context.request_uri,
          fingerprint: this.requestFingerprint(ctx),
          csrfToken,
          expiresAt: context.expires_at
        })
      );

      this.setCookie(ctx, this.settings.csrfCookieName, csrfToken);
      return {
        ...context,
        consent_required: true,
        consent_challenge: challenge.challengeId,
        authorize_endpoint: '/oauth/authorize'
      };
    },

    async postAuthorizeUser(ctx) {
      this.noStore(ctx);
      const body = this.body(ctx);
      const csrfToken = this.getCookie(ctx, this.settings.csrfCookieName);
      if (!csrfToken) {
        throw new MoleculerError('CSRF cookie is required', 403, 'LOGIN_REQUIRED');
      }

      const canonicalAccountId = await this.requireUserBearerWebId(ctx);
      const result = await this.authorizeDecision(ctx, body, csrfToken, canonicalAccountId);
      ctx.meta.$statusCode = 302;
      ctx.meta.$location = result.redirect_uri;
      return { redirect: result.redirect_uri };
    },

    async postAuthorizeInternal(ctx) {
      this.noStore(ctx);
      if (!this.settings.allowInternalAuthorizeFallback) {
        throw new MoleculerError('Internal authorize fallback is disabled', 403, 'LOGIN_REQUIRED');
      }
      this.requireInternalAuth(ctx);
      const body = this.body(ctx);
      const csrfToken = this.getCookie(ctx, this.settings.csrfCookieName);
      if (!csrfToken) {
        throw new MoleculerError('CSRF cookie is required', 403, 'LOGIN_REQUIRED');
      }

      const canonicalAccountId = this.parseCanonicalAccountId(body.canonicalAccountId);
      const result = await this.authorizeDecision(ctx, body, csrfToken, canonicalAccountId);
      ctx.meta.$statusCode = 302;
      ctx.meta.$location = result.redirect_uri;
      return { redirect: result.redirect_uri };
    },

    async exchangeToken(ctx) {
      this.noStore(ctx);
      const body = this.body(ctx);
      const proof = this.getDpopHeader(ctx);
      const nonce = this.getDpopNonceHeader(ctx);

      return this.runSafely(() =>
        ctx.call('oauth-token.exchange', {
          ...body,
          dpop_proof: proof,
          dpop_nonce: nonce,
          htm: 'POST',
          htu: this.oauthEndpoint('/oauth/token')
        })
      );
    },

    async revoke(ctx) {
      this.noStore(ctx);
      const body = this.body(ctx);
      if (!body.refresh_token) {
        throw new MoleculerError('refresh_token is required', 400, 'INVALID_REQUEST');
      }

      const info = await this.runSafely(() =>
        ctx.call('oauth-refresh-session.introspectRefreshToken', {
          refreshToken: body.refresh_token
        })
      );
      if (info && info.familyId) {
        await this.runSafely(() =>
          ctx.call('oauth-refresh-session.revokeFamily', {
            familyId: info.familyId
          })
        );
      }
      return { revoked: true };
    },

    async getClientMetadata(ctx) {
      this.noStore(ctx);
      const id = decodeURIComponent(String(ctx.params.id || '').trim());
      if (!id) {
        throw new MoleculerError('client metadata id is required', 400, 'INVALID_REQUEST');
      }

      if (id.startsWith('http://') || id.startsWith('https://')) {
        return this.runSafely(() =>
          ctx.call('oauth-client-metadata.resolveClientMetadata', { clientId: id })
        );
      }

      const cached = await this.runSafely(() =>
        ctx.call('oauth-client-metadata.getCachedByHash', { hash: id })
      );
      if (!cached) {
        ctx.meta.$statusCode = 404;
        return { error: 'not_found' };
      }
      return cached;
    },

    async getDpopNonce(ctx) {
      this.noStore(ctx);
      return this.runSafely(() =>
        ctx.call('oauth-dpop-nonce.mintNonce', {
          audience: this.settings.issuer
        })
      );
    },

    async introspect(ctx) {
      this.requireInternalAuth(ctx);
      const body = this.body(ctx);
      return this.runSafely(() =>
        ctx.call('oauth-token.introspectAccessToken', {
          token: String(body.token || '')
        })
      );
    },

    async revokeFamily(ctx) {
      this.requireInternalAuth(ctx);
      const body = this.body(ctx);
      return this.runSafely(() =>
        ctx.call('oauth-refresh-session.revokeFamily', {
          familyId: String(body.familyId || '')
        })
      );
    },

    async health(ctx) {
      this.requireInternalAuth(ctx);
      return {
        ok: true,
        service: 'oauth-api',
        issuer: this.settings.issuer,
        now: new Date().toISOString()
      };
    }
  },

  methods: {
    noStore(ctx) {
      ctx.meta.$responseHeaders = {
        ...(ctx.meta.$responseHeaders || {}),
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      };
    },

    oauthEndpoint(pathname) {
      const base = String(this.settings.issuer || '').replace(/\/+$/, '');
      const path = String(pathname || '').startsWith('/') ? String(pathname) : `/${String(pathname || '')}`;
      return `${base}${path}`;
    },

    body(ctx) {
      return (ctx.params && typeof ctx.params === 'object') ? ctx.params : {};
    },

    async runSafely(fn) {
      try {
        return await fn();
      } catch (error) {
        throw this.normalizeError(error);
      }
    },

    normalizeError(error) {
      if (error instanceof MoleculerError) {
        return new MoleculerError(
          sanitizeErrorMessage(error.message),
          error.code,
          error.type,
          error.data
        );
      }
      const status = Number.isFinite(Number(error && error.code)) ? Number(error.code) : 500;
      const type = typeof (error && error.type) === 'string' ? error.type : 'OAUTH_REQUEST_FAILED';
      return new MoleculerError(sanitizeErrorMessage(error && error.message), status, type);
    },

    requireInternalAuth(ctx) {
      const header = ctx.meta?.$headers?.authorization || ctx.meta?.$headers?.Authorization;
      if (!header || !String(header).startsWith('Bearer ')) {
        throw new MoleculerError('Missing bearer token', 401, 'AUTH_FAILED');
      }
      const token = String(header).slice(7);
      if (!this.settings.auth.internalBearerToken || token !== this.settings.auth.internalBearerToken) {
        throw new MoleculerError('Invalid bearer token', 403, 'AUTH_FAILED');
      }
    },

    async requireUserBearerWebId(ctx) {
      const header = ctx.meta?.$headers?.authorization || ctx.meta?.$headers?.Authorization;
      if (!header || !String(header).startsWith('Bearer ')) {
        throw new MoleculerError('Login is required to approve authorization', 401, 'LOGIN_REQUIRED');
      }

      const token = String(header).slice(7).trim();
      let payload;
      try {
        payload = await ctx.call('auth.jwt.decodeToken', { token });
      } catch {
        throw new MoleculerError('Login is required to approve authorization', 401, 'LOGIN_REQUIRED');
      }

      const webId = String(payload?.webId || payload?.webid || payload?.id || '').trim();
      if (!webId || webId === 'anon') {
        throw new MoleculerError('Login is required to approve authorization', 401, 'LOGIN_REQUIRED');
      }

      return webId;
    },

    parseCanonicalAccountId(value) {
      const canonicalAccountId = String(value || '').trim();
      if (!canonicalAccountId) {
        throw new MoleculerError('canonicalAccountId is required for internal authorization', 400, 'INVALID_REQUEST');
      }
      if (!canonicalAccountId.startsWith('http://') && !canonicalAccountId.startsWith('https://')) {
        throw new MoleculerError('canonicalAccountId must be an absolute URL', 400, 'INVALID_REQUEST');
      }
      return canonicalAccountId;
    },

    async authorizeDecision(ctx, body, csrfToken, canonicalAccountId) {
      return this.runSafely(() =>
        ctx.call('oauth-authorization.authorize', {
          request_uri: body.request_uri,
          decision: body.decision,
          consentChallenge: body.consent_challenge,
          requestFingerprint: this.requestFingerprint(ctx),
          csrfToken,
          canonicalAccountId
        })
      );
    },

    getDpopHeader(ctx) {
      const header = ctx.meta?.$headers?.dpop || ctx.meta?.$headers?.DPoP;
      if (!header || typeof header !== 'string') {
        throw new MoleculerError('DPoP proof header is required', 401, 'DPOP_PROOF_REQUIRED');
      }
      return String(header).trim();
    },

    getDpopNonceHeader(ctx) {
      const header = ctx.meta?.$headers?.['dpop-nonce'] || ctx.meta?.$headers?.['DPoP-Nonce'];
      return header ? String(header).trim() : undefined;
    },

    parseCookies(ctx) {
      const cookieHeader = ctx.meta?.$headers?.cookie || ctx.meta?.$headers?.Cookie;
      const cookies = {};
      if (!cookieHeader || typeof cookieHeader !== 'string') return cookies;
      for (const part of cookieHeader.split(';')) {
        const [rawKey, ...rest] = part.split('=');
        const key = String(rawKey || '').trim();
        if (!key) continue;
        cookies[key] = decodeURIComponent(rest.join('=').trim());
      }
      return cookies;
    },

    getCookie(ctx, name) {
      return this.parseCookies(ctx)[name];
    },

    setCookie(ctx, name, value) {
      const secure = this.settings.issuer.startsWith('https://');
      const parts = [
        `${name}=${encodeURIComponent(String(value))}`,
        'Path=/oauth/authorize',
        'HttpOnly',
        'SameSite=Lax'
      ];
      if (secure) {
        parts.push('Secure');
      }
      ctx.meta.$responseHeaders = {
        ...(ctx.meta.$responseHeaders || {}),
        'Set-Cookie': parts.join('; ')
      };
    },

    requestFingerprint(ctx) {
      const ip = String(ctx.meta?.$remoteIp || '').split(',')[0].trim();
      const userAgent = String(ctx.meta?.$headers?.['user-agent'] || ctx.meta?.$headers?.['User-Agent'] || '');
      return require('crypto').createHash('sha256').update(`${ip}|${userAgent}`, 'utf8').digest('hex');
    },

    randomToken() {
      return require('crypto').randomBytes(24).toString('base64url');
    }
  }
};