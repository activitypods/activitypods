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

function sanitizeErrorMessage(message) {
  return String(message || 'Preferences transfer failed')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[redacted-jwt]');
}

module.exports = {
  name: 'atproto-preferences-transfer',

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
    exportPreferences: {
      params: {
        oldPdsUrl: { type: 'string', min: 1 },
        accessToken: { type: 'string', min: 20 }
      },
      async handler(ctx) {
        const endpoint = new URL('/xrpc/app.bsky.actor.getPreferences', this.normalizePdsUrl(ctx.params.oldPdsUrl)).toString();
        const json = await this.fetchJsonWithRetry(
          endpoint,
          {
            method: 'GET',
            headers: {
              accept: 'application/json',
              authorization: `Bearer ${ctx.params.accessToken}`
            }
          },
          'ATPROTO_MIGRATION_PREFERENCES_TRANSFER_FAILED'
        );

        return {
          preferences: Array.isArray(json.preferences) ? json.preferences : []
        };
      }
    },

    importPreferences: {
      params: {
        newPdsUrl: { type: 'string', min: 1 },
        accessToken: { type: 'string', min: 20 },
        preferences: { type: 'array', optional: true }
      },
      async handler(ctx) {
        const endpoint = new URL('/xrpc/app.bsky.actor.putPreferences', this.normalizePdsUrl(ctx.params.newPdsUrl)).toString();
        await this.fetchJsonWithRetry(
          endpoint,
          {
            method: 'POST',
            headers: {
              accept: 'application/json',
              'content-type': 'application/json',
              authorization: `Bearer ${ctx.params.accessToken}`
            },
            body: JSON.stringify({
              preferences: Array.isArray(ctx.params.preferences) ? ctx.params.preferences : []
            })
          },
          'ATPROTO_MIGRATION_PREFERENCES_TRANSFER_FAILED'
        );

        return {
          imported: true,
          count: Array.isArray(ctx.params.preferences) ? ctx.params.preferences.length : 0
        };
      }
    }
  },

  methods: {
    async fetchJsonWithRetry(url, options, errorCode) {
      let lastError = null;

      for (let attempt = 1; attempt <= this.settings.maxAttempts; attempt += 1) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);
        try {
          const response = await fetch(url, {
            ...options,
            signal: controller.signal,
            redirect: 'error'
          });

          const text = await response.text();
          let json = {};
          try {
            json = text ? JSON.parse(text) : {};
          } catch {
            json = {};
          }

          if (!response.ok) {
            if (isTransientStatus(response.status) && attempt < this.settings.maxAttempts) {
              await sleep(fullJitterDelayMs(this.settings.baseDelayMs, this.settings.backoffFactor, attempt, this.settings.maxDelayMs));
              continue;
            }
            throw new MoleculerError(
              sanitizeErrorMessage(`ATProto preferences request failed with status ${response.status}`),
              response.status === 401 || response.status === 403 ? 401 : 502,
              errorCode
            );
          }

          return json;
        } catch (error) {
          lastError = error;
          if (attempt < this.settings.maxAttempts && isTransientNetworkError(error)) {
            await sleep(fullJitterDelayMs(this.settings.baseDelayMs, this.settings.backoffFactor, attempt, this.settings.maxDelayMs));
            continue;
          }

          if (error instanceof MoleculerError) {
            throw error;
          }

          throw new MoleculerError(
            sanitizeErrorMessage(error?.message || 'ATProto preferences request failed'),
            502,
            errorCode
          );
        } finally {
          clearTimeout(timer);
        }
      }

      throw new MoleculerError(
        sanitizeErrorMessage(lastError?.message || 'ATProto preferences request failed after retries'),
        502,
        errorCode
      );
    },

    normalizePdsUrl(rawUrl) {
      let parsed;
      try {
        parsed = new URL(String(rawUrl || '').trim());
      } catch (_error) {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_MIGRATION_PREFERENCES_TRANSFER_FAILED');
      }

      if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_MIGRATION_PREFERENCES_TRANSFER_FAILED');
      }

      const isLocalhost =
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1';

      const allowedScheme =
        parsed.protocol === 'https:' ||
        (this.settings.allowHttpLocalhost && isLocalhost && parsed.protocol === 'http:');

      if (!allowedScheme) {
        throw new MoleculerError('PDS URL must use HTTPS', 400, 'ATPROTO_MIGRATION_PREFERENCES_TRANSFER_FAILED');
      }

      return parsed.origin;
    }
  }
};