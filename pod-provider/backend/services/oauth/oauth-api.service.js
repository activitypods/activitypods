const { MoleculerError } = require('moleculer').Errors;
const { sanitizeErrorMessage, parseBoolean } = require('../../utils/oauth-security');
const CONFIG = require('../../config/config');
const crypto = require('crypto');

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
    sessionCookieName: process.env.OAUTH_SESSION_COOKIE_NAME || 'oauth_session',
    sessionTtlSec: Math.max(300, Math.min(Number(process.env.OAUTH_SESSION_TTL_SECONDS) || 3600, 86400)),
    sessionSecret: String(
      process.env.OAUTH_SESSION_SECRET || process.env.ACTIVITYPODS_TOKEN || 'dev-oauth-session-secret'
    ),
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
          'POST /par': 'oauth-api.createPar',
          'GET /authorize': 'oauth-api.getAuthorize',
          'POST /authorize': 'oauth-api.postAuthorizeUser',
          'POST /session/login': 'oauth-api.loginSession',
          'POST /session/logout': 'oauth-api.logoutSession',
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
      const payload = {
        ...context,
        consent_required: true,
        consent_challenge: challenge.challengeId,
        authorize_endpoint: '/oauth/authorize'
      };

      if (this.prefersHtml(ctx)) {
        const existingSession = this.getSession(ctx);
        this.setHtmlResponse(ctx);
        return this.renderAuthorizePage(payload, {
          csrfCookieName: this.settings.csrfCookieName,
          hasSession: !!existingSession,
          webId: existingSession?.webId || ''
        });
      }

      return payload;
    },

    async postAuthorizeUser(ctx) {
      this.noStore(ctx);
      const body = this.body(ctx);
      const csrfToken = this.getCookie(ctx, this.settings.csrfCookieName);
      if (!csrfToken) {
        throw new MoleculerError('CSRF cookie is required', 403, 'LOGIN_REQUIRED');
      }

      const canonicalAccountId = await this.requireUserWebId(ctx);
      const result = await this.authorizeDecision(ctx, body, csrfToken, canonicalAccountId);
      ctx.meta.$statusCode = 302;
      ctx.meta.$location = result.redirect_uri;
      return { redirect: result.redirect_uri };
    },

    async loginSession(ctx) {
      this.noStore(ctx);
      const body = this.body(ctx);
      const username = String(body.username || '').trim();
      const password = String(body.password || '');
      if (!username || !password) {
        throw new MoleculerError('username and password are required', 400, 'INVALID_REQUEST');
      }

      let account;
      try {
        await this.runSafely(() =>
          ctx.call('auth.account.verify', {
            username,
            password
          })
        );
        account = await this.runSafely(() =>
          ctx.call('auth.account.findByUsername', {
            username
          })
        );
      } catch {
        throw new MoleculerError('Invalid credentials', 401, 'LOGIN_REQUIRED');
      }

      const webId = String(account?.webId || '').trim();
      if (!webId) {
        throw new MoleculerError('Unable to resolve account webId', 500, 'OAUTH_REQUEST_FAILED');
      }

      this.setSessionCookie(ctx, webId);
      if (this.prefersHtml(ctx)) {
        const requestUri = encodeURIComponent(String(body.request_uri || ''));
        ctx.meta.$statusCode = 303;
        ctx.meta.$location = `/oauth/authorize?request_uri=${requestUri}&format=html`;
        return { redirect: ctx.meta.$location };
      }

      return {
        ok: true,
        webId,
        expires_in: this.settings.sessionTtlSec
      };
    },

    async logoutSession(ctx) {
      this.noStore(ctx);
      this.clearSessionCookie(ctx);
      return { ok: true };
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

    async requireUserWebId(ctx) {
      const fromBearer = await this.tryUserBearerWebId(ctx);
      if (fromBearer) {
        return fromBearer;
      }

      const session = this.getSession(ctx);
      if (session?.webId) {
        return session.webId;
      }

      throw new MoleculerError('Login is required to approve authorization', 401, 'LOGIN_REQUIRED');
    },

    async tryUserBearerWebId(ctx) {
      const header = ctx.meta?.$headers?.authorization || ctx.meta?.$headers?.Authorization;
      if (!header || !String(header).startsWith('Bearer ')) {
        return null;
      }

      const token = String(header).slice(7).trim();
      let payload;
      try {
        payload = await ctx.call('auth.jwt.decodeToken', { token });
      } catch {
        return null;
      }

      const webId = String(payload?.webId || payload?.webid || payload?.id || '').trim();
      if (!webId || webId === 'anon') {
        return null;
      }

      return webId;
    },

    prefersHtml(ctx) {
      const queryFormat = String(ctx.meta?.$query?.format || '').toLowerCase();
      if (queryFormat === 'html') return true;
      const accept = String(ctx.meta?.$headers?.accept || ctx.meta?.$headers?.Accept || '').toLowerCase();
      return accept.includes('text/html');
    },

    setHtmlResponse(ctx) {
      ctx.meta.$responseHeaders = {
        ...(ctx.meta.$responseHeaders || {}),
        'Content-Type': 'text/html; charset=utf-8'
      };
    },

    renderAuthorizePage(context, state) {
      const requestUri = this.escapeHtml(String(context.request_uri || ''));
      const challenge = this.escapeHtml(String(context.consent_challenge || ''));
      const clientId = this.escapeHtml(String(context.client_id || ''));
      const scope = this.escapeHtml(String(context.scope || ''));
      const loginHint = this.escapeHtml(String(context.login_hint || ''));
      const webId = this.escapeHtml(String(state.webId || ''));

      return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Authorize Client</title>
  <style>
    :root { color-scheme: light; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #f6f8fb; color: #1a1f36; }
    .wrap { max-width: 720px; margin: 40px auto; padding: 0 16px; }
    .card { background: #fff; border: 1px solid #dbe2ef; border-radius: 14px; padding: 20px; box-shadow: 0 6px 24px rgba(27, 39, 51, 0.08); }
    h1 { margin: 0 0 10px; font-size: 24px; }
    p { margin: 8px 0; line-height: 1.5; }
    code { background: #f1f5ff; padding: 2px 6px; border-radius: 6px; }
    input[type='text'], input[type='password'] { width: 100%; padding: 10px; border: 1px solid #c9d3e7; border-radius: 8px; margin-top: 6px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
    button { border: 0; border-radius: 8px; padding: 10px 14px; cursor: pointer; font-weight: 600; }
    .ok { background: #0f766e; color: #fff; }
    .deny { background: #b91c1c; color: #fff; }
    .alt { background: #1d4ed8; color: #fff; }
    .muted { color: #445; font-size: 14px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Authorize Application</h1>
      <p>Client: <code>${clientId}</code></p>
      <p>Requested scope: <code>${scope || 'atproto'}</code></p>
      <p class="muted">Login hint: ${loginHint || 'none'}</p>
      ${state.hasSession ? `<p class="muted">Signed in as <code>${webId}</code></p>` : `
      <form method="post" action="/oauth/session/login">
        <input type="hidden" name="request_uri" value="${requestUri}" />
        <input type="hidden" name="consent_challenge" value="${challenge}" />
        <label>Username<input type="text" name="username" required /></label>
        <label>Password<input type="password" name="password" required /></label>
        <div class="row"><button class="alt" type="submit">Sign In</button></div>
      </form>`}
      <hr style="border:0;border-top:1px solid #e5ebf5;margin:16px 0;" />
      <form method="post" action="/oauth/authorize">
        <input type="hidden" name="request_uri" value="${requestUri}" />
        <input type="hidden" name="consent_challenge" value="${challenge}" />
        <div class="row">
          <button class="ok" type="submit" name="decision" value="approve">Approve</button>
          <button class="deny" type="submit" name="decision" value="deny">Deny</button>
        </div>
      </form>
    </div>
  </div>
</body>
</html>`;
    },

    escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },

    signSessionPayload(payload) {
      return crypto
        .createHmac('sha256', this.settings.sessionSecret)
        .update(payload, 'utf8')
        .digest('base64url');
    },

    buildSessionToken(webId) {
      const exp = Math.floor(Date.now() / 1000) + this.settings.sessionTtlSec;
      const payload = Buffer.from(JSON.stringify({ webId, exp }), 'utf8').toString('base64url');
      const sig = this.signSessionPayload(payload);
      return `${payload}.${sig}`;
    },

    getSession(ctx) {
      const raw = this.getCookie(ctx, this.settings.sessionCookieName);
      if (!raw) return null;
      const [payload, sig] = String(raw).split('.');
      if (!payload || !sig) return null;
      const expected = this.signSessionPayload(payload);
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return null;
      }
      let decoded;
      try {
        decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      } catch {
        return null;
      }
      const exp = Number(decoded?.exp || 0);
      const webId = String(decoded?.webId || '').trim();
      if (!webId || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
        return null;
      }
      return { webId, exp };
    },

    setSessionCookie(ctx, webId) {
      const token = this.buildSessionToken(webId);
      const secure = this.settings.issuer.startsWith('https://');
      const parts = [
        `${this.settings.sessionCookieName}=${encodeURIComponent(token)}`,
        'Path=/oauth',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${this.settings.sessionTtlSec}`
      ];
      if (secure) parts.push('Secure');
      this.appendSetCookie(ctx, parts.join('; '));
    },

    clearSessionCookie(ctx) {
      const secure = this.settings.issuer.startsWith('https://');
      const parts = [
        `${this.settings.sessionCookieName}=`,
        'Path=/oauth',
        'HttpOnly',
        'SameSite=Lax',
        'Max-Age=0'
      ];
      if (secure) parts.push('Secure');
      this.appendSetCookie(ctx, parts.join('; '));
    },

    appendSetCookie(ctx, cookie) {
      const existing = ctx.meta?.$responseHeaders?.['Set-Cookie'];
      if (!existing) {
        ctx.meta.$responseHeaders = {
          ...(ctx.meta.$responseHeaders || {}),
          'Set-Cookie': cookie
        };
        return;
      }

      const values = Array.isArray(existing) ? existing.slice() : [existing];
      values.push(cookie);
      ctx.meta.$responseHeaders = {
        ...(ctx.meta.$responseHeaders || {}),
        'Set-Cookie': values
      };
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
      this.appendSetCookie(ctx, parts.join('; '));
    },

    requestFingerprint(ctx) {
      const ip = String(ctx.meta?.$remoteIp || '').split(',')[0].trim();
      const userAgent = String(ctx.meta?.$headers?.['user-agent'] || ctx.meta?.$headers?.['User-Agent'] || '');
      return crypto.createHash('sha256').update(`${ip}|${userAgent}`, 'utf8').digest('hex');
    },

    randomToken() {
      return crypto.randomBytes(24).toString('base64url');
    }
  }
};