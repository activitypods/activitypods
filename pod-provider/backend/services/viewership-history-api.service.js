'use strict';

const crypto = require('crypto');
const Redis = require('ioredis');
const { Errors: WebErrors } = require('moleculer-web');
const { MoleculerError } = require('moleculer').Errors;

const KEY_PREFIX = 'fepc4ad:viewership';
const MAX_ACTOR_LENGTH = 2048;
const MAX_OBJECT_ID_LENGTH = 2048;
const MAX_OBJECT_IDS_PER_REQUEST = 100;
const MAX_LIST_LIMIT = 500;

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

function sanitizeActorId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_ACTOR_LENGTH) return null;

  if (trimmed.startsWith('did:')) {
    return /[\u0000-\u001F\u007F]/.test(trimmed) ? null : trimmed;
  }

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

function sanitizeObjectId(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_OBJECT_ID_LENGTH) return null;

  if (trimmed.startsWith('at://') || trimmed.startsWith('did:')) {
    return /[\u0000-\u001F\u007F]/.test(trimmed) ? null : trimmed;
  }

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

function normalizeObjectIds(params) {
  const candidates = [];
  if (typeof params?.objectId === 'string') {
    candidates.push(params.objectId);
  }
  if (Array.isArray(params?.objectIds)) {
    candidates.push(...params.objectIds);
  }

  if (candidates.length === 0) {
    throw new MoleculerError('objectId or objectIds is required', 400, 'INVALID_OBJECT_IDS');
  }

  if (candidates.length > MAX_OBJECT_IDS_PER_REQUEST) {
    throw new MoleculerError(
      `objectIds must contain at most ${MAX_OBJECT_IDS_PER_REQUEST} values`,
      400,
      'INVALID_OBJECT_IDS'
    );
  }

  const deduped = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const normalized = sanitizeObjectId(candidate);
    if (!normalized) {
      throw new MoleculerError('objectIds must contain only safe object URIs', 400, 'INVALID_OBJECT_IDS');
    }
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function normalizeViewedAt(value) {
  if (value == null || value === '') {
    return Date.now();
  }

  if (typeof value !== 'string') {
    throw new MoleculerError('viewedAt must be an ISO-8601 string', 400, 'INVALID_VIEWED_AT');
  }

  const time = Date.parse(value);
  if (!Number.isFinite(time)) {
    throw new MoleculerError('viewedAt must be a valid ISO-8601 string', 400, 'INVALID_VIEWED_AT');
  }

  return time;
}

function normalizeListLimit(value, fallback) {
  if (value == null) return fallback;
  const asNumber = Number(value);
  if (!Number.isFinite(asNumber) || asNumber < 1 || asNumber > MAX_LIST_LIMIT) {
    throw new MoleculerError(`limit must be between 1 and ${MAX_LIST_LIMIT}`, 400, 'INVALID_LIMIT');
  }
  return Math.floor(asNumber);
}

function normalizeSince(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') {
    throw new MoleculerError('since must be an ISO-8601 string', 400, 'INVALID_SINCE');
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new MoleculerError('since must be a valid ISO-8601 string', 400, 'INVALID_SINCE');
  }
  return parsed;
}

function buildActorKey(actorId) {
  const actorHash = crypto.createHash('sha256').update(actorId).digest('hex');
  return `${KEY_PREFIX}:actor:${actorHash}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  name: 'viewership-history-api',

  dependencies: ['api'],

  settings: {
    routePath: '/api/viewership-history',
    internalRoutePath: '/api/internal/viewership-history',
    redisUrl: process.env.REDIS_URL || process.env.REDIS_OIDC_PROVIDER_URL || 'redis://localhost:6379',
    auth: {
      bearerToken: process.env.ACTIVITYPODS_TOKEN || process.env.INTERNAL_API_TOKEN || process.env.SIDECAR_TOKEN || ''
    },
    retentionDays: Number.parseInt(process.env.FEP_C4AD_VIEW_RETENTION_DAYS || '30', 10),
    maxRecordsPerActor: Number.parseInt(process.env.FEP_C4AD_MAX_RECORDS_PER_ACTOR || '20000', 10),
    maxAttempts: Number.parseInt(process.env.FEP_C4AD_REDIS_MAX_ATTEMPTS || '3', 10),
    initialBackoffMs: Number.parseInt(process.env.FEP_C4AD_REDIS_BACKOFF_MS || '75', 10)
  },

  async started() {
    this.redis = new Redis(this.settings.redisUrl);
    this.redis.on('error', error => {
      this.logger.error('[ViewershipHistoryApi] Redis client error: %s', error.message);
    });

    const internalToken = this.settings.auth.bearerToken;
    if (!internalToken) {
      this.logger.warn('[ViewershipHistoryApi] No internal bearer token configured; internal requests will be rejected');
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'viewership-history-authenticated',
        path: this.settings.routePath,
        authorization: true,
        authentication: true,
        bodyParsers: { json: { strict: false, limit: '64kb' } },
        aliases: {
          'POST /record': 'viewership-history-api.record',
          'POST /resolve': 'viewership-history-api.resolve',
          'POST /list': 'viewership-history-api.list'
        }
      },
      toBottom: false
    });

    await this.broker.call('api.addRoute', {
      route: {
        name: 'viewership-history-internal',
        path: this.settings.internalRoutePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false, limit: '64kb' } },
        onBeforeCall: (_ctx, _route, req) => {
          const token = parseBearerToken(req.headers.authorization || req.headers.Authorization);
          const apiKey = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'].trim() : null;
          if (!safeTokenEquals(internalToken, token) && !safeTokenEquals(internalToken, apiKey)) {
            throw new WebErrors.UnAuthorizedError(WebErrors.ERR_INVALID_TOKEN, null, 'Unauthorized');
          }
        },
        aliases: {
          'POST /record': 'viewership-history-api.recordInternal',
          'POST /resolve': 'viewership-history-api.resolveInternal',
          'POST /list': 'viewership-history-api.listInternal'
        }
      },
      toBottom: false
    });

    this.logger.info('[ViewershipHistoryApi] Routes registered under /api/viewership-history and /api/internal/viewership-history');
  },

  async stopped() {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
      this.redis = null;
    }
  },

  actions: {
    async record(ctx) {
      const actorId = sanitizeActorId(ctx.meta?.webId);
      if (!actorId || actorId === 'anon') {
        throw new MoleculerError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const objectIds = normalizeObjectIds(ctx.params || {});
      const viewedAtMs = normalizeViewedAt(ctx.params?.viewedAt);
      await this.recordViews(actorId, objectIds, viewedAtMs);

      this.setNoStoreHeaders(ctx);
      ctx.meta.$statusCode = 202;
      return {
        ok: true,
        actorId,
        recorded: objectIds.length,
        viewedAt: new Date(viewedAtMs).toISOString()
      };
    },

    async resolve(ctx) {
      const actorId = sanitizeActorId(ctx.meta?.webId);
      if (!actorId || actorId === 'anon') {
        throw new MoleculerError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const objectIds = normalizeObjectIds(ctx.params || {});
      const viewedObjectIds = await this.resolveViewed(actorId, objectIds);

      this.setNoStoreHeaders(ctx);
      return {
        actorId,
        viewedObjectIds,
        count: viewedObjectIds.length
      };
    },

    async list(ctx) {
      const actorId = sanitizeActorId(ctx.meta?.webId);
      if (!actorId || actorId === 'anon') {
        throw new MoleculerError('Authentication required', 401, 'UNAUTHORIZED');
      }

      const limit = normalizeListLimit(ctx.params?.limit, 100);
      const sinceMs = normalizeSince(ctx.params?.since);
      const viewedObjectIds = await this.listViewed(actorId, limit, sinceMs);

      this.setNoStoreHeaders(ctx);
      return {
        actorId,
        viewedObjectIds,
        count: viewedObjectIds.length
      };
    },

    async recordInternal(ctx) {
      const actorId = sanitizeActorId(ctx.params?.actorId);
      if (!actorId) {
        throw new MoleculerError('actorId must be a safe actor URI or DID', 400, 'INVALID_ACTOR_ID');
      }

      const objectIds = normalizeObjectIds(ctx.params || {});
      const viewedAtMs = normalizeViewedAt(ctx.params?.viewedAt);
      await this.recordViews(actorId, objectIds, viewedAtMs);

      this.setNoStoreHeaders(ctx);
      ctx.meta.$statusCode = 202;
      return {
        ok: true,
        actorId,
        recorded: objectIds.length,
        viewedAt: new Date(viewedAtMs).toISOString()
      };
    },

    async resolveInternal(ctx) {
      const actorId = sanitizeActorId(ctx.params?.actorId);
      if (!actorId) {
        throw new MoleculerError('actorId must be a safe actor URI or DID', 400, 'INVALID_ACTOR_ID');
      }

      const objectIds = normalizeObjectIds(ctx.params || {});
      const viewedObjectIds = await this.resolveViewed(actorId, objectIds);

      this.setNoStoreHeaders(ctx);
      return {
        actorId,
        viewedObjectIds,
        count: viewedObjectIds.length
      };
    },

    async listInternal(ctx) {
      const actorId = sanitizeActorId(ctx.params?.actorId);
      if (!actorId) {
        throw new MoleculerError('actorId must be a safe actor URI or DID', 400, 'INVALID_ACTOR_ID');
      }

      const limit = normalizeListLimit(ctx.params?.limit, 100);
      const sinceMs = normalizeSince(ctx.params?.since);
      const viewedObjectIds = await this.listViewed(actorId, limit, sinceMs);

      this.setNoStoreHeaders(ctx);
      return {
        actorId,
        viewedObjectIds,
        count: viewedObjectIds.length
      };
    }
  },

  methods: {
    async withRetry(operation) {
      const maxAttempts = Math.max(1, Number(this.settings.maxAttempts) || 1);
      const initialBackoffMs = Math.max(1, Number(this.settings.initialBackoffMs) || 1);
      let attempt = 0;
      let delayMs = initialBackoffMs;

      while (true) {
        try {
          return await operation();
        } catch (error) {
          attempt += 1;
          if (attempt >= maxAttempts) {
            throw error;
          }
          await sleep(delayMs);
          delayMs = Math.min(delayMs * 2, 1000);
        }
      }
    },

    async recordViews(actorId, objectIds, viewedAtMs) {
      const retentionDays = Math.max(1, Number(this.settings.retentionDays) || 1);
      const maxRecordsPerActor = Math.max(100, Number(this.settings.maxRecordsPerActor) || 100);
      const key = buildActorKey(actorId);
      const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      await this.withRetry(async () => {
        const pipeline = this.redis.pipeline();
        for (const objectId of objectIds) {
          pipeline.zadd(key, viewedAtMs, objectId);
        }
        pipeline.zremrangebyscore(key, '-inf', cutoffMs);
        pipeline.zremrangebyrank(key, 0, -(maxRecordsPerActor + 1));
        pipeline.expire(key, retentionDays * 24 * 60 * 60);
        await pipeline.exec();
      });
    },

    async resolveViewed(actorId, objectIds) {
      const key = buildActorKey(actorId);
      return this.withRetry(async () => {
        const pipeline = this.redis.pipeline();
        for (const objectId of objectIds) {
          pipeline.zscore(key, objectId);
        }

        const rows = await pipeline.exec();
        const viewed = [];
        for (let index = 0; index < rows.length; index += 1) {
          const [error, value] = rows[index];
          if (!error && value != null) {
            viewed.push(objectIds[index]);
          }
        }
        return viewed;
      });
    },

    async listViewed(actorId, limit, sinceMs) {
      const key = buildActorKey(actorId);
      return this.withRetry(async () => {
        if (sinceMs != null) {
          return this.redis.zrevrangebyscore(key, '+inf', sinceMs, 'LIMIT', 0, limit);
        }
        return this.redis.zrevrange(key, 0, limit - 1);
      });
    },

    setNoStoreHeaders(ctx) {
      ctx.meta.$responseHeaders = {
        ...(ctx.meta.$responseHeaders || {}),
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      };
    }
  }
};
