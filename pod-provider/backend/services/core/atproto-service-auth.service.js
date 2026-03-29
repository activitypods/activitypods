const fetch = require('node-fetch');
const { MoleculerError } = require('moleculer').Errors;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isTransientStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isTransientNetworkError(error) {
  const code = String(error?.code || '').toUpperCase();
  return (
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'EAI_AGAIN' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'ABORT_ERR'
  );
}

function fullJitterDelayMs(baseMs, factor, attempt, capMs) {
  const exp = Math.min(capMs, Math.floor(baseMs * Math.pow(factor, attempt - 1)));
  return Math.floor(Math.random() * Math.max(1, exp));
}

function decodeJwtPayloadWithoutVerify(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;
  try {
    const raw = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sanitizeErrorMessage(message) {
  return String(message || 'Service auth failed')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[redacted-jwt]');
}

module.exports = {
  name: 'atproto-service-auth',

  settings: {
    timeoutMs: Math.max(1_000, Math.min(Number(process.env.ATPROTO_MIGRATION_TIMEOUT_MS) || 8_000, 20_000)),
    maxAttempts: 5,
    baseDelayMs: 250,
    backoffFactor: 2,
    maxDelayMs: 5_000,
    allowHttpLocalhost:
      process.env.ATPROTO_MIGRATION_ALLOW_HTTP_LOCALHOST === 'true' || process.env.NODE_ENV !== 'production'
  },

  actions: {
    getServiceAuth: {
      params: {
        oldPdsUrl: { type: 'string', min: 1 },
        sessionAccessToken: { type: 'string', min: 20 },
        aud: { type: 'string', min: 1 },
        did: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const oldPdsUrl = this.normalizePdsUrl(ctx.params.oldPdsUrl);
        const expectedDid = this.normalizeDid(ctx.params.did);
        const aud = String(ctx.params.aud || '').trim();

        let audOrigin;
        try {
          audOrigin = new URL(aud).origin;
        } catch (_error) {
          throw new MoleculerError('Invalid audience URL', 400, 'ATPROTO_MIGRATION_SERVICE_AUTH_FAILED');
        }

        const endpoint = new URL('/xrpc/com.atproto.server.getServiceAuth', oldPdsUrl).toString();

        let lastError = null;

        for (let attempt = 1; attempt <= this.settings.maxAttempts; attempt += 1) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);

            const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                accept: 'application/json',
                'content-type': 'application/json',
                authorization: `Bearer ${ctx.params.sessionAccessToken}`
              },
              body: JSON.stringify({
                aud: audOrigin,
                lxm: 'com.atproto.server.createAccount',
                exp: Math.floor(Date.now() / 1000) + 300
              }),
              signal: controller.signal,
              redirect: 'error'
            });
            clearTimeout(timer);

            const text = await response.text();
            let json = {};
            try {
              json = text ? JSON.parse(text) : {};
            } catch {
              json = {};
            }

            if (!response.ok) {
              if (isTransientStatus(response.status) && attempt < this.settings.maxAttempts) {
                await sleep(
                  fullJitterDelayMs(
                    this.settings.baseDelayMs,
                    this.settings.backoffFactor,
                    attempt,
                    this.settings.maxDelayMs
                  )
                );
                continue;
              }

              throw new MoleculerError(
                sanitizeErrorMessage(`Service auth request failed with status ${response.status}`),
                response.status === 401 || response.status === 403 ? 401 : 502,
                'ATPROTO_MIGRATION_SERVICE_AUTH_FAILED'
              );
            }

            const token = String(json.token || '').trim();
            if (!token) {
              throw new MoleculerError(
                'Service auth response is missing token',
                502,
                'ATPROTO_MIGRATION_SERVICE_AUTH_FAILED'
              );
            }

            const payload = decodeJwtPayloadWithoutVerify(token);
            if (!payload || typeof payload !== 'object') {
              throw new MoleculerError(
                'Service auth token payload is invalid',
                502,
                'ATPROTO_MIGRATION_SERVICE_AUTH_FAILED'
              );
            }

            const tokenSub = String(payload.sub || '').trim();
            const tokenAudRaw = payload.aud;
            const tokenAudList = Array.isArray(tokenAudRaw)
              ? tokenAudRaw.map(value => String(value).trim())
              : [String(tokenAudRaw || '').trim()];

            if (tokenSub !== expectedDid) {
              throw new MoleculerError(
                'Service auth token subject DID mismatch',
                400,
                'ATPROTO_MIGRATION_SERVICE_AUTH_FAILED'
              );
            }

            if (!tokenAudList.includes(audOrigin) && !tokenAudList.includes(aud)) {
              throw new MoleculerError(
                'Service auth token audience mismatch',
                400,
                'ATPROTO_MIGRATION_SERVICE_AUTH_FAILED'
              );
            }

            return {
              token,
              did: tokenSub,
              aud: audOrigin,
              expiresAt: Number(payload.exp || 0) || null
            };
          } catch (error) {
            lastError = error;
            const transient =
              error instanceof MoleculerError
                ? false
                : isTransientNetworkError(error);

            if (attempt < this.settings.maxAttempts && transient) {
              await sleep(
                fullJitterDelayMs(
                  this.settings.baseDelayMs,
                  this.settings.backoffFactor,
                  attempt,
                  this.settings.maxDelayMs
                )
              );
              continue;
            }

            if (error instanceof MoleculerError) {
              throw error;
            }
            throw new MoleculerError(
              sanitizeErrorMessage(error?.message || 'Service auth request failed'),
              502,
              'ATPROTO_MIGRATION_SERVICE_AUTH_FAILED'
            );
          }
        }

        throw new MoleculerError(
          sanitizeErrorMessage(lastError?.message || 'Service auth failed after retries'),
          502,
          'ATPROTO_MIGRATION_SERVICE_AUTH_FAILED'
        );
      }
    }
  },

  methods: {
    normalizeDid(did) {
      const normalized = String(did || '').trim();
      if (!/^did:(plc|web):[A-Za-z0-9._:%-]+$/.test(normalized)) {
        throw new MoleculerError('Invalid DID', 400, 'ATPROTO_MIGRATION_SERVICE_AUTH_FAILED');
      }
      return normalized;
    },

    normalizePdsUrl(rawUrl) {
      let parsed;
      try {
        parsed = new URL(String(rawUrl || '').trim());
      } catch (_error) {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_MIGRATION_SERVICE_AUTH_FAILED');
      }

      if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_MIGRATION_SERVICE_AUTH_FAILED');
      }

      const isLocalhost =
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1';

      const allowedScheme =
        parsed.protocol === 'https:' ||
        (this.settings.allowHttpLocalhost && isLocalhost && parsed.protocol === 'http:');

      if (!allowedScheme) {
        throw new MoleculerError('PDS URL must use HTTPS', 400, 'ATPROTO_MIGRATION_SERVICE_AUTH_FAILED');
      }

      return parsed.origin;
    }
  }
};