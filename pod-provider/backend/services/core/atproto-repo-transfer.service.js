const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
  return String(message || 'Repo transfer failed')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[redacted-jwt]');
}

module.exports = {
  name: 'atproto-repo-transfer',

  settings: {
    timeoutMs: Math.max(2_000, Math.min(Number(process.env.ATPROTO_MIGRATION_TIMEOUT_MS) || 15_000, 30_000)),
    maxAttempts: 5,
    baseDelayMs: 250,
    backoffFactor: 2,
    maxDelayMs: 5_000,
    maxCarBytes: Math.max(1_048_576, Math.min(Number(process.env.ATPROTO_MIGRATION_MAX_CAR_BYTES) || 268_435_456, 1_073_741_824)),
    tempDir: process.env.ATPROTO_MIGRATION_TEMP_DIR || path.join(os.tmpdir(), 'activitypods-atproto-migration'),
    allowHttpLocalhost:
      process.env.ATPROTO_MIGRATION_ALLOW_HTTP_LOCALHOST === 'true' || process.env.NODE_ENV !== 'production'
  },

  created() {
    fs.mkdirSync(this.settings.tempDir, { recursive: true });
  },

  actions: {
    fetchRepoCar: {
      params: {
        oldPdsUrl: { type: 'string', min: 1 },
        did: { type: 'string', min: 1 },
        accessToken: { type: 'string', min: 20 }
      },
      async handler(ctx) {
        const oldPdsUrl = this.normalizePdsUrl(ctx.params.oldPdsUrl);
        const did = this.normalizeDid(ctx.params.did);
        const endpoint = new URL('/xrpc/com.atproto.sync.getRepo', oldPdsUrl);
        endpoint.searchParams.set('did', did);

        let lastError = null;

        for (let attempt = 1; attempt <= this.settings.maxAttempts; attempt += 1) {
          const spoolPath = path.join(this.settings.tempDir, `${Date.now()}-${crypto.randomUUID()}.car`);
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);

            const response = await fetch(endpoint.toString(), {
              method: 'GET',
              headers: {
                accept: 'application/vnd.ipld.car',
                authorization: `Bearer ${ctx.params.accessToken}`
              },
              signal: controller.signal,
              redirect: 'error'
            });
            clearTimeout(timer);

            if (!response.ok) {
              const status = response.status;
              const text = await response.text().catch(() => '');
              if (isTransientStatus(status) && attempt < this.settings.maxAttempts) {
                await sleep(fullJitterDelayMs(this.settings.baseDelayMs, this.settings.backoffFactor, attempt, this.settings.maxDelayMs));
                continue;
              }
              throw new MoleculerError(
                sanitizeErrorMessage(`Repo CAR fetch failed with status ${status}: ${text.slice(0, 256)}`),
                status === 401 || status === 403 ? 401 : 502,
                'ATPROTO_MIGRATION_REPO_FETCH_FAILED'
              );
            }

            const hasher = crypto.createHash('sha256');
            const writer = fs.createWriteStream(spoolPath, { flags: 'wx' });
            const revHeader = response.headers.get('atproto-repo-rev') || null;
            let bytes = 0;

            await new Promise((resolve, reject) => {
              response.body.on('data', chunk => {
                bytes += chunk.length;
                if (bytes > this.settings.maxCarBytes) {
                  reject(
                    new MoleculerError(
                      `Repo CAR exceeds max size cap (${this.settings.maxCarBytes} bytes)`,
                      413,
                      'ATPROTO_MIGRATION_REPO_FETCH_FAILED'
                    )
                  );
                  return;
                }
                hasher.update(chunk);
                writer.write(chunk);
              });

              response.body.on('error', reject);
              response.body.on('end', () => {
                writer.end();
              });
              writer.on('error', reject);
              writer.on('finish', resolve);
            });

            if (bytes === 0) {
              throw new MoleculerError('Repo CAR stream is empty', 502, 'ATPROTO_MIGRATION_REPO_FETCH_FAILED');
            }

            return {
              spoolPath,
              did,
              bytes,
              sha256: hasher.digest('hex'),
              repoRev: revHeader
            };
          } catch (error) {
            lastError = error;
            await fs.promises.rm(spoolPath, { force: true }).catch(() => {});

            const retryable =
              (error instanceof MoleculerError && Number(error.code) >= 500) ||
              isTransientNetworkError(error);
            if (attempt < this.settings.maxAttempts && retryable) {
              await sleep(fullJitterDelayMs(this.settings.baseDelayMs, this.settings.backoffFactor, attempt, this.settings.maxDelayMs));
              continue;
            }

            if (error instanceof MoleculerError) {
              throw error;
            }
            throw new MoleculerError(
              sanitizeErrorMessage(error?.message || 'Repo CAR fetch failed'),
              502,
              'ATPROTO_MIGRATION_REPO_FETCH_FAILED'
            );
          }
        }

        throw new MoleculerError(
          sanitizeErrorMessage(lastError?.message || 'Repo CAR fetch failed after retries'),
          502,
          'ATPROTO_MIGRATION_REPO_FETCH_FAILED'
        );
      }
    },

    importRepoCar: {
      params: {
        newPdsUrl: { type: 'string', min: 1 },
        did: { type: 'string', min: 1 },
        accessToken: { type: 'string', min: 20 },
        spoolPath: { type: 'string', min: 1 },
        expectedSha256: { type: 'string', length: 64, optional: true },
        expectedBytes: { type: 'number', integer: true, positive: true, optional: true }
      },
      async handler(ctx) {
        const newPdsUrl = this.normalizePdsUrl(ctx.params.newPdsUrl);
        const did = this.normalizeDid(ctx.params.did);
        const endpoint = new URL('/xrpc/com.atproto.repo.importRepo', newPdsUrl).toString();
        const spoolPath = path.resolve(String(ctx.params.spoolPath));

        const stats = await fs.promises.stat(spoolPath).catch(() => null);
        if (!stats || !stats.isFile()) {
          throw new MoleculerError('Repo CAR spool file does not exist', 400, 'ATPROTO_MIGRATION_REPO_IMPORT_FAILED');
        }
        if (ctx.params.expectedBytes && Number(ctx.params.expectedBytes) !== stats.size) {
          throw new MoleculerError('Repo CAR size mismatch', 400, 'ATPROTO_MIGRATION_REPO_IMPORT_FAILED');
        }

        if (ctx.params.expectedSha256) {
          const digest = await this.sha256File(spoolPath);
          if (digest !== ctx.params.expectedSha256) {
            throw new MoleculerError('Repo CAR checksum mismatch', 400, 'ATPROTO_MIGRATION_REPO_IMPORT_FAILED');
          }
        }

        let lastError = null;

        for (let attempt = 1; attempt <= this.settings.maxAttempts; attempt += 1) {
          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);

            const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                accept: 'application/json',
                'content-type': 'application/vnd.ipld.car',
                authorization: `Bearer ${ctx.params.accessToken}`
              },
              body: fs.createReadStream(spoolPath),
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
                await sleep(fullJitterDelayMs(this.settings.baseDelayMs, this.settings.backoffFactor, attempt, this.settings.maxDelayMs));
                continue;
              }

              throw new MoleculerError(
                sanitizeErrorMessage(`Repo import failed with status ${response.status}`),
                response.status === 401 || response.status === 403 ? 401 : 502,
                'ATPROTO_MIGRATION_REPO_IMPORT_FAILED',
                { did }
              );
            }

            return {
              imported: true,
              did,
              response: json
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

            if (error instanceof MoleculerError) {
              throw error;
            }

            throw new MoleculerError(
              sanitizeErrorMessage(error?.message || 'Repo import failed'),
              502,
              'ATPROTO_MIGRATION_REPO_IMPORT_FAILED'
            );
          }
        }

        throw new MoleculerError(
          sanitizeErrorMessage(lastError?.message || 'Repo import failed after retries'),
          502,
          'ATPROTO_MIGRATION_REPO_IMPORT_FAILED'
        );
      }
    },

    verifyImportedRepo: {
      params: {
        newPdsUrl: { type: 'string', min: 1 },
        did: { type: 'string', min: 1 },
        accessToken: { type: 'string', min: 20 }
      },
      async handler(ctx) {
        const newPdsUrl = this.normalizePdsUrl(ctx.params.newPdsUrl);
        const did = this.normalizeDid(ctx.params.did);

        const endpoint = new URL('/xrpc/com.atproto.repo.describeRepo', newPdsUrl);
        endpoint.searchParams.set('repo', did);

        const response = await fetch(endpoint.toString(), {
          method: 'GET',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${ctx.params.accessToken}`
          },
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
          throw new MoleculerError(
            sanitizeErrorMessage(`Imported repo verification failed with status ${response.status}`),
            response.status === 401 || response.status === 403 ? 401 : 502,
            'ATPROTO_MIGRATION_VERIFICATION_FAILED'
          );
        }

        if (String(json.did || '').trim() !== did) {
          throw new MoleculerError('Imported repo DID mismatch', 502, 'ATPROTO_MIGRATION_VERIFICATION_FAILED');
        }

        return {
          verified: true,
          did,
          handle: json.handle || null,
          collections: json.collections || []
        };
      }
    },

    createManagedHostingForExistingDid: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 },
        did: { type: 'string', min: 1 },
        handle: { type: 'string', min: 1 },
        newPdsUrl: { type: 'string', min: 1 },
        serviceAuth: { type: 'string', min: 20 }
      },
      async handler(ctx) {
        const newPdsUrl = this.normalizePdsUrl(ctx.params.newPdsUrl);
        const endpoint = new URL('/xrpc/com.atproto.server.createAccount', newPdsUrl).toString();
        let lastError = null;

        for (let attempt = 1; attempt <= this.settings.maxAttempts; attempt += 1) {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);
          try {
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                accept: 'application/json',
                'content-type': 'application/json'
              },
              body: JSON.stringify({
                did: this.normalizeDid(ctx.params.did),
                handle: this.normalizeHandle(ctx.params.handle),
                serviceAuth: String(ctx.params.serviceAuth),
                deactivated: true
              }),
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
                sanitizeErrorMessage(`Managed account creation failed with status ${response.status}`),
                response.status === 409 ? 409 : (response.status === 401 || response.status === 403 ? 401 : 502),
                'ATPROTO_MIGRATION_MANAGED_ACCOUNT_CREATE_FAILED'
              );
            }

            const accessJwt = String(json.accessJwt || '').trim();
            const refreshJwt = String(json.refreshJwt || '').trim();
            if (!accessJwt) {
              throw new MoleculerError(
                'Managed account creation response is missing accessJwt',
                502,
                'ATPROTO_MIGRATION_MANAGED_ACCOUNT_CREATE_FAILED'
              );
            }

            return {
              canonicalAccountId: ctx.params.canonicalAccountId,
              did: String(json.did || ctx.params.did),
              handle: String(json.handle || ctx.params.handle),
              accessJwt,
              refreshJwt: refreshJwt || null,
              pdsUrl: newPdsUrl,
              deactivated: true
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

            if (error instanceof MoleculerError) {
              throw error;
            }

            throw new MoleculerError(
              sanitizeErrorMessage(error?.message || 'Managed account creation failed'),
              502,
              'ATPROTO_MIGRATION_MANAGED_ACCOUNT_CREATE_FAILED'
            );
          } finally {
            clearTimeout(timer);
          }
        }

        throw new MoleculerError(
          sanitizeErrorMessage(lastError?.message || 'Managed account creation failed after retries'),
          502,
          'ATPROTO_MIGRATION_MANAGED_ACCOUNT_CREATE_FAILED'
        );
      }
    },

    cleanupTempCar: {
      params: {
        spoolPath: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const spoolPath = path.resolve(String(ctx.params.spoolPath));
        await fs.promises.rm(spoolPath, { force: true }).catch(() => {});
        return { removed: true };
      }
    }
  },

  methods: {
    normalizeDid(did) {
      const normalized = String(did || '').trim();
      if (!/^did:(plc|web):[A-Za-z0-9._:%-]+$/.test(normalized)) {
        throw new MoleculerError('Invalid DID', 400, 'ATPROTO_MIGRATION_REPO_FETCH_FAILED');
      }
      return normalized;
    },

    normalizeHandle(handle) {
      const normalized = String(handle || '').trim().toLowerCase();
      if (
        !normalized ||
        normalized.length > 253 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(normalized)
      ) {
        throw new MoleculerError('Invalid handle', 400, 'ATPROTO_MIGRATION_MANAGED_ACCOUNT_CREATE_FAILED');
      }
      return normalized;
    },

    normalizePdsUrl(rawUrl) {
      let parsed;
      try {
        parsed = new URL(String(rawUrl || '').trim());
      } catch (_error) {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_MIGRATION_REPO_FETCH_FAILED');
      }

      if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_MIGRATION_REPO_FETCH_FAILED');
      }

      const isLocalhost =
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1';

      const allowedScheme =
        parsed.protocol === 'https:' ||
        (this.settings.allowHttpLocalhost && isLocalhost && parsed.protocol === 'http:');

      if (!allowedScheme) {
        throw new MoleculerError('PDS URL must use HTTPS', 400, 'ATPROTO_MIGRATION_REPO_FETCH_FAILED');
      }

      return parsed.origin;
    },

    async sha256File(filePath) {
      const hash = crypto.createHash('sha256');
      await new Promise((resolve, reject) => {
        const reader = fs.createReadStream(filePath);
        reader.on('error', reject);
        reader.on('data', chunk => hash.update(chunk));
        reader.on('end', resolve);
      });
      return hash.digest('hex');
    }
  }
};