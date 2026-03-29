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
  return String(message || 'Blob transfer failed')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[redacted-jwt]');
}

module.exports = {
  name: 'atproto-blob-transfer',

  settings: {
    timeoutMs: Math.max(2_000, Math.min(Number(process.env.ATPROTO_MIGRATION_TIMEOUT_MS) || 15_000, 30_000)),
    maxAttempts: 5,
    baseDelayMs: 250,
    backoffFactor: 2,
    maxDelayMs: 5_000,
    pageLimit: Math.max(10, Math.min(Number(process.env.ATPROTO_MIGRATION_BLOB_PAGE_LIMIT) || 500, 1_000)),
    allowHttpLocalhost:
      process.env.ATPROTO_MIGRATION_ALLOW_HTTP_LOCALHOST === 'true' || process.env.NODE_ENV !== 'production'
  },

  actions: {
    listSourceBlobs: {
      params: {
        oldPdsUrl: { type: 'string', min: 1 },
        did: { type: 'string', min: 1 },
        accessToken: { type: 'string', min: 20 },
        cursor: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const oldPdsUrl = this.normalizePdsUrl(ctx.params.oldPdsUrl);
        const did = this.normalizeDid(ctx.params.did);

        const endpoint = new URL('/xrpc/com.atproto.sync.listBlobs', oldPdsUrl);
        endpoint.searchParams.set('did', did);
        endpoint.searchParams.set('limit', String(this.settings.pageLimit));
        if (ctx.params.cursor) endpoint.searchParams.set('cursor', String(ctx.params.cursor));

        const json = await this.fetchJsonWithRetry(endpoint.toString(), {
          method: 'GET',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${ctx.params.accessToken}`
          }
        }, 'ATPROTO_MIGRATION_BLOB_TRANSFER_FAILED');

        return {
          cids: Array.isArray(json.cids) ? json.cids.filter(cid => typeof cid === 'string' && cid.length > 0) : [],
          cursor: typeof json.cursor === 'string' && json.cursor ? json.cursor : null
        };
      }
    },

    listMissingTargetBlobs: {
      params: {
        newPdsUrl: { type: 'string', min: 1 },
        did: { type: 'string', min: 1 },
        accessToken: { type: 'string', min: 20 },
        cursor: { type: 'string', optional: true },
        candidates: { type: 'array', items: 'string', optional: true }
      },
      async handler(ctx) {
        const newPdsUrl = this.normalizePdsUrl(ctx.params.newPdsUrl);
        const endpoint = new URL('/xrpc/com.atproto.repo.listMissingBlobs', newPdsUrl);
        endpoint.searchParams.set('did', this.normalizeDid(ctx.params.did));
        endpoint.searchParams.set('limit', String(this.settings.pageLimit));
        if (ctx.params.cursor) endpoint.searchParams.set('cursor', String(ctx.params.cursor));

        const options = {
          method: 'POST',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            authorization: `Bearer ${ctx.params.accessToken}`
          },
          body: JSON.stringify({
            cids: Array.isArray(ctx.params.candidates) ? ctx.params.candidates : undefined
          })
        };

        const json = await this.fetchJsonWithRetry(
          endpoint.toString(),
          options,
          'ATPROTO_MIGRATION_BLOB_TRANSFER_FAILED'
        );

        return {
          cids: Array.isArray(json.cids) ? json.cids.filter(cid => typeof cid === 'string' && cid.length > 0) : [],
          cursor: typeof json.cursor === 'string' && json.cursor ? json.cursor : null
        };
      }
    },

    copyBlob: {
      params: {
        oldPdsUrl: { type: 'string', min: 1 },
        newPdsUrl: { type: 'string', min: 1 },
        did: { type: 'string', min: 1 },
        cid: { type: 'string', min: 1 },
        sourceAccessToken: { type: 'string', min: 20 },
        targetAccessToken: { type: 'string', min: 20 }
      },
      async handler(ctx) {
        const oldPdsUrl = this.normalizePdsUrl(ctx.params.oldPdsUrl);
        const newPdsUrl = this.normalizePdsUrl(ctx.params.newPdsUrl);
        const did = this.normalizeDid(ctx.params.did);
        const cid = String(ctx.params.cid || '').trim();

        const sourceEndpoint = new URL('/xrpc/com.atproto.sync.getBlob', oldPdsUrl);
        sourceEndpoint.searchParams.set('did', did);
        sourceEndpoint.searchParams.set('cid', cid);

        const targetEndpoint = new URL('/xrpc/com.atproto.repo.uploadBlob', newPdsUrl).toString();

        let lastError = null;

        for (let attempt = 1; attempt <= this.settings.maxAttempts; attempt += 1) {
          const sourceController = new AbortController();
          const sourceTimer = setTimeout(() => sourceController.abort(), this.settings.timeoutMs);
          try {
            const srcRes = await fetch(sourceEndpoint.toString(), {
              method: 'GET',
              headers: {
                authorization: `Bearer ${ctx.params.sourceAccessToken}`
              },
              signal: sourceController.signal,
              redirect: 'error'
            });
            clearTimeout(sourceTimer);

            if (!srcRes.ok) {
              if (isTransientStatus(srcRes.status) && attempt < this.settings.maxAttempts) {
                await sleep(fullJitterDelayMs(this.settings.baseDelayMs, this.settings.backoffFactor, attempt, this.settings.maxDelayMs));
                continue;
              }
              throw new MoleculerError(
                `Source blob fetch failed (${srcRes.status})`,
                srcRes.status === 401 || srcRes.status === 403 ? 401 : 502,
                'ATPROTO_MIGRATION_BLOB_TRANSFER_FAILED'
              );
            }

            const uploadController = new AbortController();
            const uploadTimer = setTimeout(() => uploadController.abort(), this.settings.timeoutMs);
            let uploadRes;
            try {
              uploadRes = await fetch(targetEndpoint, {
                method: 'POST',
                headers: {
                  authorization: `Bearer ${ctx.params.targetAccessToken}`,
                  'content-type': srcRes.headers.get('content-type') || 'application/octet-stream'
                },
                body: srcRes.body,
                signal: uploadController.signal,
                redirect: 'error'
              });
            } finally {
              clearTimeout(uploadTimer);
            }

            const text = await uploadRes.text();
            let json = {};
            try {
              json = text ? JSON.parse(text) : {};
            } catch {
              json = {};
            }

            if (!uploadRes.ok) {
              if (isTransientStatus(uploadRes.status) && attempt < this.settings.maxAttempts) {
                await sleep(fullJitterDelayMs(this.settings.baseDelayMs, this.settings.backoffFactor, attempt, this.settings.maxDelayMs));
                continue;
              }

              throw new MoleculerError(
                `Target blob upload failed (${uploadRes.status})`,
                uploadRes.status === 401 || uploadRes.status === 403 ? 401 : 502,
                'ATPROTO_MIGRATION_BLOB_TRANSFER_FAILED'
              );
            }

            const returnedCid =
              String(json?.blob?.ref?.$link || json?.blob?.cid || '').trim();
            if (returnedCid && returnedCid !== cid) {
              throw new MoleculerError(
                'Blob CID mismatch after upload',
                502,
                'ATPROTO_MIGRATION_BLOB_TRANSFER_FAILED'
              );
            }

            return {
              copied: true,
              cid
            };
          } catch (error) {
            lastError = error;
            const retryable =
              (error instanceof MoleculerError && Number(error.code) >= 500) ||
              isTransientNetworkError(error);

            if (attempt < this.settings.maxAttempts && retryable) {
              await sleep(fullJitterDelayMs(this.settings.baseDelayMs, this.settings.backoffFactor, attempt, this.settings.maxDelayMs));
              continue;
            }

            if (error instanceof MoleculerError) throw error;

            throw new MoleculerError(
              sanitizeErrorMessage(error?.message || 'Blob copy failed'),
              502,
              'ATPROTO_MIGRATION_BLOB_TRANSFER_FAILED'
            );
          } finally {
            clearTimeout(sourceTimer);
          }
        }

        throw new MoleculerError(
          sanitizeErrorMessage(lastError?.message || 'Blob copy failed after retries'),
          502,
          'ATPROTO_MIGRATION_BLOB_TRANSFER_FAILED'
        );
      }
    },

    transferMissingBlobs: {
      params: {
        oldPdsUrl: { type: 'string', min: 1 },
        newPdsUrl: { type: 'string', min: 1 },
        did: { type: 'string', min: 1 },
        sourceAccessToken: { type: 'string', min: 20 },
        targetAccessToken: { type: 'string', min: 20 },
        requiredCompletionRatio: { type: 'number', optional: true }
      },
      async handler(ctx) {
        const ratio = Number.isFinite(Number(ctx.params.requiredCompletionRatio))
          ? Math.max(0, Math.min(Number(ctx.params.requiredCompletionRatio), 1))
          : 1;

        let sourceCursor = null;
        let copiedCount = 0;
        const failedCids = [];
        let sourceCount = 0;

        do {
          const sourcePage = await ctx.call('atproto-blob-transfer.listSourceBlobs', {
            oldPdsUrl: ctx.params.oldPdsUrl,
            did: ctx.params.did,
            accessToken: ctx.params.sourceAccessToken,
            cursor: sourceCursor
          });

          sourceCursor = sourcePage.cursor || null;
          sourceCount += sourcePage.cids.length;

          if (!sourcePage.cids.length) {
            continue;
          }

          const missing = await ctx.call('atproto-blob-transfer.listMissingTargetBlobs', {
            newPdsUrl: ctx.params.newPdsUrl,
            did: ctx.params.did,
            accessToken: ctx.params.targetAccessToken,
            candidates: sourcePage.cids
          });

          for (const cid of missing.cids) {
            try {
              await ctx.call('atproto-blob-transfer.copyBlob', {
                oldPdsUrl: ctx.params.oldPdsUrl,
                newPdsUrl: ctx.params.newPdsUrl,
                did: ctx.params.did,
                cid,
                sourceAccessToken: ctx.params.sourceAccessToken,
                targetAccessToken: ctx.params.targetAccessToken
              });
              copiedCount += 1;
            } catch (_error) {
              failedCids.push(cid);
            }
          }
        } while (sourceCursor);

        const unresolvedCount = failedCids.length;
        const completionRatio = sourceCount <= 0 ? 1 : (sourceCount - unresolvedCount) / sourceCount;

        return {
          copiedCount,
          sourceCount,
          missingCount: unresolvedCount,
          failedCids,
          completionRatio,
          completionMet: completionRatio >= ratio
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
              sanitizeErrorMessage(`ATProto request failed with status ${response.status}`),
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

          if (error instanceof MoleculerError) throw error;
          throw new MoleculerError(
            sanitizeErrorMessage(error?.message || 'ATProto request failed'),
            502,
            errorCode
          );
        } finally {
          clearTimeout(timer);
        }
      }

      throw new MoleculerError(
        sanitizeErrorMessage(lastError?.message || 'ATProto request failed after retries'),
        502,
        errorCode
      );
    },

    normalizeDid(did) {
      const normalized = String(did || '').trim();
      if (!/^did:(plc|web):[A-Za-z0-9._:%-]+$/.test(normalized)) {
        throw new MoleculerError('Invalid DID', 400, 'ATPROTO_MIGRATION_BLOB_TRANSFER_FAILED');
      }
      return normalized;
    },

    normalizePdsUrl(rawUrl) {
      let parsed;
      try {
        parsed = new URL(String(rawUrl || '').trim());
      } catch (_error) {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_MIGRATION_BLOB_TRANSFER_FAILED');
      }

      if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_MIGRATION_BLOB_TRANSFER_FAILED');
      }

      const isLocalhost =
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1';

      const allowedScheme =
        parsed.protocol === 'https:' ||
        (this.settings.allowHttpLocalhost && isLocalhost && parsed.protocol === 'http:');

      if (!allowedScheme) {
        throw new MoleculerError('PDS URL must use HTTPS', 400, 'ATPROTO_MIGRATION_BLOB_TRANSFER_FAILED');
      }

      return parsed.origin;
    }
  }
};