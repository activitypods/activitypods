/**
 * did:plc genesis operation submitter.
 *
 * Disabled by default. To validate against a sandbox, run a local PLC
 * directory from https://github.com/did-method-plc/did-method-plc#running-the-server,
 * then set:
 *   APODS_ATPROTO_ENABLE_PLC_SUBMISSION=true
 *   APODS_ATPROTO_PLC_DIRECTORY_URL=http://localhost:2582
 *
 * The service persists submission state in Redis, uses decorrelated jitter
 * backoff, and self-heals on startup by reconciling pending operations.
 * It never stores or logs private keys. The signed PLC op is public once
 * accepted by a PLC directory, but logs still avoid printing signatures.
 */

const Redis = require('ioredis');
const { MoleculerError } = require('moleculer').Errors;

const DEFAULT_PLC_DIRECTORY_URL = 'https://plc.directory';
const DEFAULT_REDIS_URL = process.env.SEMAPPS_REDIS_CACHE_URL || process.env.REDIS_URL || 'redis://localhost:6379';
const TRUNCATED_ERROR_BODY_BYTES = 256;

module.exports = {
  name: 'atproto-plc-submitter',

  dependencies: ['atproto-plc-builder'],

  settings: {
    enabled: process.env.APODS_ATPROTO_ENABLE_PLC_SUBMISSION === 'true',
    redisUrl: DEFAULT_REDIS_URL,
    plcDirectoryUrl: normalizeBaseUrl(process.env.APODS_ATPROTO_PLC_DIRECTORY_URL || DEFAULT_PLC_DIRECTORY_URL),
    httpTimeoutMs: clampInt(process.env.APODS_ATPROTO_PLC_HTTP_TIMEOUT_MS, 10000, 1000, 120000),
    maxAttempts: clampInt(process.env.APODS_ATPROTO_PLC_MAX_ATTEMPTS, 12, 1, 50),
    baseDelayMs: clampInt(process.env.APODS_ATPROTO_PLC_BASE_DELAY_MS, 1000, 100, 60000),
    maxDelayMs: clampInt(process.env.APODS_ATPROTO_PLC_MAX_DELAY_MS, 5 * 60 * 1000, 1000, 30 * 60 * 1000),
    reconcilerIntervalMs: clampInt(process.env.APODS_ATPROTO_PLC_RECONCILER_INTERVAL_MS, 60000, 5000, 30 * 60 * 1000),
    keyPrefix: process.env.APODS_ATPROTO_PLC_REDIS_KEY_PREFIX || 'plc-submitter:'
  },

  created() {
    this.redis = null;
    this.reconciler = null;
    this.reconciling = false;
  },

  async started() {
    if (!this.settings.enabled) {
      this.logger.info('[atproto-plc-submitter] disabled (set APODS_ATPROTO_ENABLE_PLC_SUBMISSION=true to enable)');
      return;
    }

    this.redis = new Redis(this.settings.redisUrl);
    this.logger.info(
      `[atproto-plc-submitter] enabled directory=${this.settings.plcDirectoryUrl} maxAttempts=${this.settings.maxAttempts}`
    );

    this.reconciler = setInterval(() => {
      this._reconcile().catch(err => {
        this.logger.warn(`[atproto-plc-submitter] reconcile failed: ${sanitizeError(err)}`);
      });
    }, this.settings.reconcilerIntervalMs);
    this.reconciler.unref?.();

    setImmediate(() => {
      this._reconcile().catch(err => {
        this.logger.warn(`[atproto-plc-submitter] startup reconcile failed: ${sanitizeError(err)}`);
      });
    });
  },

  async stopped() {
    if (this.reconciler) {
      clearInterval(this.reconciler);
      this.reconciler = null;
    }
    if (this.redis) {
      await this.redis.quit().catch(() => this.redis.disconnect());
      this.redis = null;
    }
  },

  actions: {
    enqueue: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 },
        did: { type: 'string', pattern: /^did:plc:[a-z2-7]{24}$/ },
        signedOp: { type: 'object' }
      },
      async handler(ctx) {
        this._assertEnabled();
        const { canonicalAccountId, did, signedOp } = ctx.params;

        if (
          (await this.redis.exists(this._confirmedKey(did))) ||
          (await this.redis.exists(this._confirmedAccountKey(canonicalAccountId)))
        ) {
          return { enqueued: false, alreadyConfirmed: true, alreadyPending: false, did };
        }

        const existingFailed = await this._loadJson(this._failedKey(canonicalAccountId));
        if (existingFailed) {
          throw new MoleculerError(
            'PLC submission has terminal failed state; manual review is required before retrying',
            409,
            'ATPROTO_PLC_FAILED_STATE_EXISTS',
            {
              canonicalAccountId,
              did: existingFailed.did || null,
              failedAt: existingFailed.failedAt || null,
              lastError: existingFailed.lastError || null
            }
          );
        }

        const existingPending = await this._loadJson(this._pendingKey(canonicalAccountId));
        if (existingPending) {
          if (existingPending.did !== did) {
            throw new MoleculerError(
              'Pending PLC submission DID does not match newly built DID; refusing to overwrite state',
              409,
              'ATPROTO_PLC_PENDING_DID_MISMATCH',
              {
                canonicalAccountId,
                pendingDid: existingPending.did,
                newDid: did
              }
            );
          }
          return { enqueued: false, alreadyConfirmed: false, alreadyPending: true, did };
        }

        const now = Date.now();
        const state = {
          canonicalAccountId,
          did,
          signedOp,
          attempts: 0,
          firstAttemptAt: null,
          lastAttemptAt: null,
          nextAttemptAt: now,
          lastDelayMs: this.settings.baseDelayMs,
          lastError: null,
          createdAt: new Date(now).toISOString()
        };

        const inserted = await this.redis.set(this._pendingKey(canonicalAccountId), JSON.stringify(state), 'NX');
        if (inserted !== 'OK') {
          const racedPending = await this._loadJson(this._pendingKey(canonicalAccountId));
          if (racedPending && racedPending.did !== did) {
            throw new MoleculerError(
              'Concurrent PLC submission DID does not match newly built DID; refusing to overwrite state',
              409,
              'ATPROTO_PLC_PENDING_DID_MISMATCH',
              {
                canonicalAccountId,
                pendingDid: racedPending.did,
                newDid: did
              }
            );
          }
        }
        return {
          enqueued: inserted === 'OK',
          alreadyConfirmed: false,
          alreadyPending: inserted !== 'OK',
          did
        };
      }
    },

    buildAndEnqueue: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 },
        handle: { type: 'string', min: 1 },
        pdsEndpoint: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        this._assertEnabled();
        const built = await ctx.call('atproto-plc-builder.buildAndSign', ctx.params);
        const result = await ctx.call('atproto-plc-submitter.enqueue', {
          canonicalAccountId: ctx.params.canonicalAccountId,
          did: built.did,
          signedOp: built.signedOp
        });
        return { ...result, did: built.did, signedOpCborBase64: built.signedOpCborBase64 };
      }
    },

    submit: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        this._assertEnabled();
        return this._submitPending(ctx.params.canonicalAccountId);
      }
    },

    getStatus: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 },
        did: { type: 'string', optional: true }
      },
      async handler(ctx) {
        this._assertEnabled();
        const { canonicalAccountId, did } = ctx.params;
        const pending = await this._loadJson(this._pendingKey(canonicalAccountId));
        const failed = await this._loadJson(this._failedKey(canonicalAccountId));
        const confirmedByDid = did ? await this.redis.get(this._confirmedKey(did)) : null;
        const confirmedByAccount = await this._loadJson(this._confirmedAccountKey(canonicalAccountId));
        return {
          status:
            confirmedByDid || confirmedByAccount ? 'confirmed' : failed ? 'failed' : pending ? 'pending' : 'missing',
          pending: pending ? redactState(pending) : null,
          failed,
          confirmed: confirmedByAccount || null,
          confirmedAt: confirmedByDid || confirmedByAccount?.confirmedAt || null
        };
      }
    },

    reconcile: {
      async handler() {
        this._assertEnabled();
        return this._reconcile();
      }
    }
  },

  methods: {
    _assertEnabled() {
      if (!this.settings.enabled || !this.redis) {
        throw new MoleculerError(
          'PLC submission is disabled. Set APODS_ATPROTO_ENABLE_PLC_SUBMISSION=true to enable.',
          503,
          'ATPROTO_PLC_SUBMISSION_DISABLED'
        );
      }
    },

    _pendingKey(canonicalAccountId) {
      return `${this.settings.keyPrefix}pending:${canonicalAccountId}`;
    },

    _confirmedKey(did) {
      return `${this.settings.keyPrefix}confirmed:${did}`;
    },

    _confirmedAccountKey(canonicalAccountId) {
      return `${this.settings.keyPrefix}confirmed-account:${canonicalAccountId}`;
    },

    _failedKey(canonicalAccountId) {
      return `${this.settings.keyPrefix}failed:${canonicalAccountId}`;
    },

    async _loadJson(key) {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (_) {
        await this.redis.del(key).catch(() => {});
        return null;
      }
    },

    async _saveJson(key, value) {
      await this.redis.set(key, JSON.stringify(value));
    },

    async _submitPending(canonicalAccountId) {
      const confirmed = await this._loadJson(this._confirmedAccountKey(canonicalAccountId));
      if (confirmed) {
        return {
          status: 'confirmed',
          did: confirmed.did,
          attempts: confirmed.attempts || 0,
          confirmedAt: confirmed.confirmedAt
        };
      }

      const state = await this._loadJson(this._pendingKey(canonicalAccountId));
      if (!state) {
        const failed = await this._loadJson(this._failedKey(canonicalAccountId));
        if (failed) return { status: 'failed', state: failed };
        return { status: 'missing', canonicalAccountId };
      }

      const now = Date.now();
      if (state.nextAttemptAt && state.nextAttemptAt > now) {
        return { status: 'pending', nextAttemptAt: state.nextAttemptAt, state: redactState(state) };
      }

      if (state.attempts >= this.settings.maxAttempts) {
        return this._markFailed(state, `exhausted ${this.settings.maxAttempts} attempts`);
      }

      const nextState = {
        ...state,
        attempts: state.attempts + 1,
        firstAttemptAt: state.firstAttemptAt || new Date(now).toISOString(),
        lastAttemptAt: new Date(now).toISOString()
      };
      await this._saveJson(this._pendingKey(canonicalAccountId), nextState);

      const result = await this._attemptSubmission(nextState);
      if (result.kind === 'confirmed') {
        const confirmedAt = new Date().toISOString();
        await this.redis.set(this._confirmedKey(nextState.did), confirmedAt);
        await this._saveJson(this._confirmedAccountKey(canonicalAccountId), {
          canonicalAccountId,
          did: nextState.did,
          attempts: nextState.attempts,
          confirmedAt
        });
        await this.redis.del(this._pendingKey(canonicalAccountId));
        return { status: 'confirmed', did: nextState.did, attempts: nextState.attempts };
      }

      if (result.kind === 'failed') {
        return this._markFailed(nextState, result.error);
      }

      const delayMs = this._decorrelatedJitter(nextState.lastDelayMs || this.settings.baseDelayMs);
      const retryState = {
        ...nextState,
        lastDelayMs: delayMs,
        nextAttemptAt: Date.now() + delayMs,
        lastError: result.error
      };
      await this._saveJson(this._pendingKey(canonicalAccountId), retryState);
      return {
        status: 'pending',
        did: retryState.did,
        attempts: retryState.attempts,
        nextAttemptAt: retryState.nextAttemptAt,
        lastError: retryState.lastError
      };
    },

    async _markFailed(state, reason) {
      const failed = {
        ...redactState(state),
        status: 'failed',
        failedAt: new Date().toISOString(),
        lastError: reason
      };
      await this._saveJson(this._failedKey(state.canonicalAccountId), failed);
      await this.redis.del(this._pendingKey(state.canonicalAccountId));
      this.logger.error(`[atproto-plc-submitter] failed ${state.did}: ${reason}`);
      return { status: 'failed', did: state.did, attempts: state.attempts, lastError: reason };
    },

    async _attemptSubmission(state) {
      const url = `${this.settings.plcDirectoryUrl}/${state.did}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.settings.httpTimeoutMs);
      timeout.unref?.();

      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: JSON.stringify(state.signedOp),
          signal: controller.signal
        });

        if (res.status >= 200 && res.status < 300) {
          return { kind: 'confirmed' };
        }
        if (res.status === 409) {
          return { kind: 'confirmed' };
        }
        const body = await safeResponseBody(res);
        const error = `HTTP ${res.status}: ${body}`;
        if (res.status === 429 || res.status >= 500) {
          return { kind: 'retry', error };
        }
        return { kind: 'failed', error };
      } catch (err) {
        return { kind: 'retry', error: sanitizeError(err) };
      } finally {
        clearTimeout(timeout);
      }
    },

    _decorrelatedJitter(previousDelayMs) {
      const lower = this.settings.baseDelayMs;
      const upper = Math.max(lower, previousDelayMs) * 3;
      return Math.min(this.settings.maxDelayMs, Math.floor(lower + Math.random() * (upper - lower)));
    },

    async _reconcile() {
      if (this.reconciling) return { reconciled: 0, skipped: true };
      this.reconciling = true;
      let cursor = '0';
      let reconciled = 0;
      try {
        do {
          const [nextCursor, keys] = await this.redis.scan(
            cursor,
            'MATCH',
            `${this.settings.keyPrefix}pending:*`,
            'COUNT',
            100
          );
          cursor = nextCursor;
          for (const key of keys) {
            const state = await this._loadJson(key);
            if (!state || state.nextAttemptAt > Date.now()) continue;
            try {
              await this._submitPending(state.canonicalAccountId);
              reconciled += 1;
            } catch (err) {
              this.logger.warn(`[atproto-plc-submitter] reconcile item failed: ${sanitizeError(err)}`);
            }
          }
        } while (cursor !== '0');
        return { reconciled };
      } finally {
        this.reconciling = false;
      }
    }
  }
};

async function safeResponseBody(res) {
  try {
    return redactSensitiveText(await res.text()).slice(0, TRUNCATED_ERROR_BODY_BYTES);
  } catch (_) {
    return '<unreadable response body>';
  }
}

function sanitizeError(err) {
  if (!err) return 'unknown error';
  if (err.name === 'AbortError') return 'request timed out';
  if (err.code)
    return redactSensitiveText(`${err.code}: ${err.message || 'request failed'}`).slice(0, TRUNCATED_ERROR_BODY_BYTES);
  return redactSensitiveText(String(err.message || err)).slice(0, TRUNCATED_ERROR_BODY_BYTES);
}

function redactSensitiveText(text) {
  return String(text || '')
    .replace(/("sig"\s*:\s*")[^"]+(")/gi, '$1<redacted>$2')
    .replace(/("rotationKeys"\s*:\s*)\[[^\]]*\]/gi, '$1["<redacted>"]');
}

function redactState(state) {
  if (!state) return state;
  const { signedOp, ...rest } = state;
  return {
    ...rest,
    signedOpPresent: Boolean(signedOp)
  };
}

function normalizeBaseUrl(rawUrl) {
  if (!rawUrl) return DEFAULT_PLC_DIRECTORY_URL;
  try {
    const url = new URL(rawUrl);
    return url.toString().replace(/\/+$/, '');
  } catch (_) {
    throw new Error(`Invalid APODS_ATPROTO_PLC_DIRECTORY_URL: ${rawUrl}`);
  }
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
