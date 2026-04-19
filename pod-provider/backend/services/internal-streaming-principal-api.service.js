'use strict';

const crypto = require('crypto');
const { Errors: WebErrors } = require('moleculer-web');
const { MoleculerError } = require('moleculer').Errors;

function parseBearerToken(value) {
  if (!value || typeof value !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
  return match ? match[1] : null;
}

function safeTokenEquals(expected, provided) {
  if (!expected || !provided) return false;
  const left = Buffer.from(String(expected), 'utf8');
  const right = Buffer.from(String(provided), 'utf8');
  const max = Math.max(left.length, right.length);
  const leftPadded = Buffer.alloc(max, 0);
  const rightPadded = Buffer.alloc(max, 0);
  left.copy(leftPadded);
  right.copy(rightPadded);
  return left.length === right.length && crypto.timingSafeEqual(leftPadded, rightPadded);
}

function normalizePrincipal(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 4096) return null;

  try {
    const parsed = new URL(trimmed);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function parseCookieHeader(value) {
  if (!value || typeof value !== 'string' || value.length > 16384) {
    return {};
  }

  const cookies = {};
  for (const segment of value.split(';')) {
    const index = segment.indexOf('=');
    if (index <= 0) continue;
    const name = segment.slice(0, index).trim();
    const rawValue = segment.slice(index + 1).trim();
    if (!name || !rawValue) continue;
    cookies[name] = rawValue;
  }
  return cookies;
}

function normalizeResolvedPrincipal(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  return normalizePrincipal(
    String(
      candidate.principal ||
      candidate.webId ||
      candidate.webid ||
      candidate.id ||
      ''
    )
  );
}

module.exports = {
  name: 'internal-streaming-principal-api',

  dependencies: ['api', 'auth.jwt'],

  settings: {
    auth: {
      bearerToken: process.env.ACTIVITYPODS_TOKEN || process.env.INTERNAL_API_TOKEN || process.env.SIDECAR_TOKEN || '',
      oauthSessionCookieName: process.env.OAUTH_SESSION_COOKIE_NAME || 'oauth_session',
      oauthSessionSecret: String(
        process.env.OAUTH_SESSION_SECRET || process.env.ACTIVITYPODS_TOKEN || 'dev-oauth-session-secret'
      ),
      cookieResolverAction: process.env.STREAMING_PRINCIPAL_COOKIE_RESOLVER_ACTION || '',
      tokenCookieNames: String(
        process.env.STREAMING_PRINCIPAL_TOKEN_COOKIE_NAMES || 'access_token,token,jwt,id_token'
      )
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
    },
    routePath: '/api/internal/streaming'
  },

  async started() {
    const bearerToken = this.settings.auth.bearerToken;

    if (!bearerToken) {
      this.logger.warn('[InternalStreamingPrincipalApi] No internal bearer token configured; all requests will be rejected');
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'streaming-principal-internal',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false, limit: '64kb' } },
        onBeforeCall: (_ctx, _route, req) => {
          const token = parseBearerToken(req.headers.authorization || req.headers.Authorization);
          if (!safeTokenEquals(bearerToken, token)) {
            throw new WebErrors.UnAuthorizedError(WebErrors.ERR_INVALID_TOKEN, null, 'Unauthorized');
          }
        },
        aliases: {
          'POST /resolve-principal': 'internal-streaming-principal-api.resolvePrincipal'
        }
      },
      toBottom: false
    });

    this.logger.info('[InternalStreamingPrincipalApi] Internal route registered under /api/internal/streaming/resolve-principal');
  },

  actions: {
    async resolvePrincipal(ctx) {
      this.applyResponseHeaders(ctx);

      const forwardedAuthorization = typeof ctx.params?.authorization === 'string'
        ? ctx.params.authorization.trim()
        : '';
      const forwardedCookie = typeof ctx.params?.cookie === 'string'
        ? ctx.params.cookie.trim()
        : '';

      const principal =
        await this.resolvePrincipalFromBearerToken(ctx, forwardedAuthorization) ||
        this.resolvePrincipalFromOauthSessionCookie(forwardedCookie) ||
        await this.resolvePrincipalFromCookieAction(ctx, forwardedCookie) ||
        await this.resolvePrincipalFromTokenCookie(ctx, forwardedCookie);

      if (!principal || principal === 'anon') {
        throw new MoleculerError('The forwarded auth context does not identify an authenticated principal', 401, 'LOGIN_REQUIRED');
      }

      return {
        principal,
        auth_type: forwardedAuthorization ? 'bearer' : 'cookie'
      };
    }
  },

  methods: {
    applyResponseHeaders(ctx) {
      ctx.meta.$responseHeaders = {
        ...(ctx.meta.$responseHeaders || {}),
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      };
    },

    async resolvePrincipalFromBearerToken(ctx, forwardedAuthorization) {
      const userToken = parseBearerToken(forwardedAuthorization);
      if (!userToken) {
        return null;
      }

      try {
        const payload = await ctx.call('auth.jwt.decodeToken', { token: userToken });
        return normalizeResolvedPrincipal(payload);
      } catch {
        throw new MoleculerError('Unable to decode forwarded bearer token', 401, 'LOGIN_REQUIRED');
      }
    },

    async resolvePrincipalFromCookieAction(ctx, forwardedCookie) {
      if (!forwardedCookie || !this.settings.auth.cookieResolverAction) {
        return null;
      }

      try {
        const resolved = await ctx.call(this.settings.auth.cookieResolverAction, {
          cookie: forwardedCookie,
          origin: typeof ctx.params?.origin === 'string' ? ctx.params.origin.trim() : undefined,
          userAgent: typeof ctx.params?.userAgent === 'string' ? ctx.params.userAgent.trim() : undefined,
          xForwardedFor: typeof ctx.params?.xForwardedFor === 'string' ? ctx.params.xForwardedFor.trim() : undefined
        });
        return normalizeResolvedPrincipal(resolved);
      } catch (error) {
        this.logger.warn('[InternalStreamingPrincipalApi] Cookie resolver action failed', {
          action: this.settings.auth.cookieResolverAction,
          error: error instanceof Error ? error.message : String(error)
        });
        return null;
      }
    },

    async resolvePrincipalFromTokenCookie(ctx, forwardedCookie) {
      if (!forwardedCookie) {
        return null;
      }

      const cookies = parseCookieHeader(forwardedCookie);
      for (const cookieName of this.settings.auth.tokenCookieNames) {
        const tokenValue = cookies[cookieName];
        if (!tokenValue) {
          continue;
        }

        const candidateToken = parseBearerToken(tokenValue) || tokenValue;
        try {
          const payload = await ctx.call('auth.jwt.decodeToken', { token: candidateToken });
          const principal = normalizeResolvedPrincipal(payload);
          if (principal) {
            return principal;
          }
        } catch {
          continue;
        }
      }

      return null;
    },

    resolvePrincipalFromOauthSessionCookie(forwardedCookie) {
      if (!forwardedCookie) {
        return null;
      }

      const sessionCookieName = this.settings.auth.oauthSessionCookieName;
      const sessionSecret = String(this.settings.auth.oauthSessionSecret || '').trim();
      if (!sessionCookieName || !sessionSecret) {
        return null;
      }

      const cookies = parseCookieHeader(forwardedCookie);
      const raw = typeof cookies[sessionCookieName] === 'string'
        ? decodeURIComponent(cookies[sessionCookieName])
        : '';
      if (!raw) {
        return null;
      }

      const [payload, sig] = raw.split('.');
      if (!payload || !sig) {
        return null;
      }

      const expected = crypto
        .createHmac('sha256', sessionSecret)
        .update(payload, 'utf8')
        .digest('base64url');
      if (!safeTokenEquals(expected, sig)) {
        return null;
      }

      let decoded;
      try {
        decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      } catch {
        return null;
      }

      const exp = Number(decoded?.exp || 0);
      if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) {
        return null;
      }

      return normalizePrincipal(String(decoded?.webId || ''));
    }
  }
};
