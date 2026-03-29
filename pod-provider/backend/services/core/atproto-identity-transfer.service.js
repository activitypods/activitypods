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
  return String(message || 'Identity transfer failed')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[redacted-jwt]');
}

module.exports = {
  name: 'atproto-identity-transfer',

  settings: {
    plcDirectoryUrl: process.env.ATPROTO_PLC_DIRECTORY_URL || 'https://plc.directory',
    timeoutMs: Math.max(1_000, Math.min(Number(process.env.ATPROTO_MIGRATION_TIMEOUT_MS) || 8_000, 20_000)),
    maxAttempts: 5,
    baseDelayMs: 250,
    backoffFactor: 2,
    maxDelayMs: 5_000,
    verificationMaxWaitMs: Math.max(5_000, Math.min(Number(process.env.ATPROTO_MIGRATION_VERIFICATION_MAX_WAIT_MS) || 90_000, 300_000)),
    allowHttpLocalhost:
      process.env.ATPROTO_MIGRATION_ALLOW_HTTP_LOCALHOST === 'true' || process.env.NODE_ENV !== 'production'
  },

  actions: {
    getRecommendedDidCredentials: {
      params: {
        newPdsUrl: { type: 'string', min: 1 },
        accessToken: { type: 'string', min: 20 }
      },
      async handler(ctx) {
        return this.callXrpc({
          pdsUrl: this.normalizePdsUrl(ctx.params.newPdsUrl),
          endpoint: '/xrpc/com.atproto.identity.getRecommendedDidCredentials',
          method: 'GET',
          accessToken: ctx.params.accessToken,
          errorCode: 'ATPROTO_MIGRATION_IDENTITY_UPDATE_FAILED'
        });
      }
    },

    requestPlcOperationSignature: {
      params: {
        oldPdsUrl: { type: 'string', min: 1 },
        accessToken: { type: 'string', min: 20 }
      },
      async handler(ctx) {
        return this.callXrpc({
          pdsUrl: this.normalizePdsUrl(ctx.params.oldPdsUrl),
          endpoint: '/xrpc/com.atproto.identity.requestPlcOperationSignature',
          method: 'POST',
          accessToken: ctx.params.accessToken,
          body: {},
          errorCode: 'ATPROTO_MIGRATION_IDENTITY_UPDATE_FAILED'
        });
      }
    },

    signPlcOperation: {
      params: {
        oldPdsUrl: { type: 'string', min: 1 },
        accessToken: { type: 'string', min: 20 },
        token: { type: 'string', min: 1 },
        requestedDidCredentials: { type: 'object' }
      },
      async handler(ctx) {
        return this.callXrpc({
          pdsUrl: this.normalizePdsUrl(ctx.params.oldPdsUrl),
          endpoint: '/xrpc/com.atproto.identity.signPlcOperation',
          method: 'POST',
          accessToken: ctx.params.accessToken,
          body: {
            token: String(ctx.params.token),
            ...ctx.params.requestedDidCredentials
          },
          errorCode: 'ATPROTO_MIGRATION_IDENTITY_UPDATE_FAILED'
        });
      }
    },

    submitPlcOperation: {
      params: {
        newPdsUrl: { type: 'string', min: 1 },
        accessToken: { type: 'string', min: 20 },
        signedOperation: { type: 'object' }
      },
      async handler(ctx) {
        return this.callXrpc({
          pdsUrl: this.normalizePdsUrl(ctx.params.newPdsUrl),
          endpoint: '/xrpc/com.atproto.identity.submitPlcOperation',
          method: 'POST',
          accessToken: ctx.params.accessToken,
          body: ctx.params.signedOperation,
          errorCode: 'ATPROTO_MIGRATION_IDENTITY_UPDATE_FAILED'
        });
      }
    },

    verifyIdentityNowPointsToNewPds: {
      params: {
        did: { type: 'string', min: 1 },
        expectedPdsUrl: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const did = this.normalizeDid(ctx.params.did);
        const expectedPds = this.normalizePdsUrl(ctx.params.expectedPdsUrl);
        const startedAt = Date.now();
        let attempt = 1;
        let lastError = null;

        while (Date.now() - startedAt < this.settings.verificationMaxWaitMs) {
          try {
            if (did.startsWith('did:web:')) {
              return await this.verifyDidWeb({ did, expectedPds });
            }
            return await this.verifyDidPlc({ did, expectedPds });
          } catch (error) {
            lastError = error;
            const isPendingPropagation =
              error instanceof MoleculerError &&
              error.type === 'ATPROTO_MIGRATION_VERIFICATION_FAILED' &&
              Number(error.code) === 409;

            if (!isPendingPropagation) {
              throw error;
            }

            const delayMs = fullJitterDelayMs(
              this.settings.baseDelayMs,
              this.settings.backoffFactor,
              attempt,
              this.settings.maxDelayMs
            );
            await sleep(delayMs);
            attempt += 1;
          }
        }

        throw new MoleculerError(
          sanitizeErrorMessage(lastError?.message || 'Identity update verification timed out'),
          409,
          'ATPROTO_MIGRATION_VERIFICATION_FAILED'
        );
      }
    },

    activateAccount: {
      params: {
        pdsUrl: { type: 'string', min: 1 },
        accessToken: { type: 'string', min: 20 }
      },
      async handler(ctx) {
        await this.callXrpc({
          pdsUrl: this.normalizePdsUrl(ctx.params.pdsUrl),
          endpoint: '/xrpc/com.atproto.server.activateAccount',
          method: 'POST',
          accessToken: ctx.params.accessToken,
          body: {},
          errorCode: 'ATPROTO_MIGRATION_NEW_ACCOUNT_ACTIVATION_FAILED'
        });
        return { activated: true };
      }
    },

    deactivateAccount: {
      params: {
        pdsUrl: { type: 'string', min: 1 },
        accessToken: { type: 'string', min: 20 }
      },
      async handler(ctx) {
        await this.callXrpc({
          pdsUrl: this.normalizePdsUrl(ctx.params.pdsUrl),
          endpoint: '/xrpc/com.atproto.server.deactivateAccount',
          method: 'POST',
          accessToken: ctx.params.accessToken,
          body: {},
          errorCode: 'ATPROTO_MIGRATION_OLD_ACCOUNT_DEACTIVATION_FAILED'
        });
        return { deactivated: true };
      }
    }
  },

  methods: {
    async verifyDidPlc({ did, expectedPds }) {
      const endpoint = `${String(this.settings.plcDirectoryUrl).replace(/\/$/, '')}/${encodeURIComponent(did)}`;
      const doc = await this.fetchJsonWithRetry(endpoint, {
        method: 'GET',
        headers: { accept: 'application/json' }
      }, 'ATPROTO_MIGRATION_VERIFICATION_FAILED');
      const service = Array.isArray(doc?.service)
        ? doc.service.find(item => item && typeof item.serviceEndpoint === 'string' && (item.id === '#atproto_pds' || item.type === 'AtprotoPersonalDataServer'))
        : null;

      if (!service?.serviceEndpoint) {
        throw new MoleculerError(
          'DID PLC document missing PDS service endpoint',
          502,
          'ATPROTO_MIGRATION_VERIFICATION_FAILED'
        );
      }

      const actualOrigin = new URL(service.serviceEndpoint).origin;
      if (actualOrigin !== expectedPds) {
        throw new MoleculerError(
          'DID document still points to previous PDS endpoint',
          409,
          'ATPROTO_MIGRATION_VERIFICATION_FAILED'
        );
      }

      return {
        verified: true,
        did,
        pdsUrl: actualOrigin,
        method: 'did:plc'
      };
    },

    async verifyDidWeb({ did, expectedPds }) {
      const hostPath = did.replace(/^did:web:/, '');
      const host = hostPath.replace(/:/g, '/');
      const didWebUrl = `https://${host}/.well-known/did.json`;
      const doc = await this.fetchJsonWithRetry(didWebUrl, {
        method: 'GET',
        headers: { accept: 'application/json' }
      }, 'ATPROTO_MIGRATION_VERIFICATION_FAILED');
      const services = Array.isArray(doc?.service) ? doc.service : [];
      const pdsService = services.find(item => item && typeof item.serviceEndpoint === 'string' && (item.id === `${did}#atproto_pds` || item.type === 'AtprotoPersonalDataServer'));

      if (!pdsService?.serviceEndpoint) {
        throw new MoleculerError(
          'did:web document missing ATProto PDS service',
          502,
          'ATPROTO_MIGRATION_VERIFICATION_FAILED'
        );
      }

      const actualOrigin = new URL(pdsService.serviceEndpoint).origin;
      if (actualOrigin !== expectedPds) {
        throw new MoleculerError(
          'did:web still points to previous PDS endpoint',
          409,
          'ATPROTO_MIGRATION_VERIFICATION_FAILED'
        );
      }

      return {
        verified: true,
        did,
        pdsUrl: actualOrigin,
        method: 'did:web'
      };
    },

    async callXrpc({ pdsUrl, endpoint, method, accessToken, body, errorCode }) {
      return this.fetchJsonWithRetry(
        new URL(endpoint, pdsUrl).toString(),
        {
          method,
          headers: {
            accept: 'application/json',
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
            authorization: `Bearer ${accessToken}`
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {})
        },
        errorCode
      );
    },

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
              sanitizeErrorMessage(`ATProto identity operation failed with status ${response.status}`),
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
            sanitizeErrorMessage(error?.message || 'ATProto identity operation failed'),
            502,
            errorCode
          );
        } finally {
          clearTimeout(timer);
        }
      }

      throw new MoleculerError(
        sanitizeErrorMessage(lastError?.message || 'ATProto identity operation failed after retries'),
        502,
        errorCode
      );
    },

    normalizeDid(did) {
      const normalized = String(did || '').trim();
      if (!/^did:(plc|web):[A-Za-z0-9._:%-]+$/.test(normalized)) {
        throw new MoleculerError('Invalid DID', 400, 'ATPROTO_MIGRATION_IDENTITY_UPDATE_FAILED');
      }
      return normalized;
    },

    normalizePdsUrl(rawUrl) {
      let parsed;
      try {
        parsed = new URL(String(rawUrl || '').trim());
      } catch (_error) {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_MIGRATION_IDENTITY_UPDATE_FAILED');
      }

      if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_MIGRATION_IDENTITY_UPDATE_FAILED');
      }

      const isLocalhost =
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1';

      const allowedScheme =
        parsed.protocol === 'https:' ||
        (this.settings.allowHttpLocalhost && isLocalhost && parsed.protocol === 'http:');

      if (!allowedScheme) {
        throw new MoleculerError('PDS URL must use HTTPS', 400, 'ATPROTO_MIGRATION_IDENTITY_UPDATE_FAILED');
      }

      return parsed.origin;
    }
  }
};