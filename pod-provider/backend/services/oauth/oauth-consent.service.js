const Redis = require('ioredis');
const { parseIntWithBounds, nowEpochSec } = require('../../utils/oauth-security');

module.exports = {
  name: 'oauth-consent',

  settings: {
    redisUrl: process.env.SEMAPPS_REDIS_CACHE_URL || 'redis://localhost:6379',
    keyPrefix: 'oauth:grant',
    ttlSec: parseIntWithBounds(process.env.OAUTH_GRANT_TTL_SECONDS, 60 * 60 * 24 * 30, 60, 60 * 60 * 24 * 180, 'OAUTH_GRANT_TTL_SECONDS')
  },

  created() {
    this.redis = new Redis(this.settings.redisUrl);
  },

  async stopped() {
    if (this.redis) {
      await this.redis.quit().catch(() => this.redis.disconnect());
    }
  },

  actions: {
    upsert: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 },
        clientId: { type: 'string', min: 1 },
        scope: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const now = nowEpochSec();
        const key = `${this.settings.keyPrefix}:${ctx.params.canonicalAccountId}:${ctx.params.clientId}`;
        const record = {
          canonicalAccountId: ctx.params.canonicalAccountId,
          clientId: ctx.params.clientId,
          scope: ctx.params.scope,
          grantedAt: now,
          updatedAt: now,
          revoked: false
        };
        await this.redis.set(key, JSON.stringify(record), 'EX', this.settings.ttlSec);
        return record;
      }
    },

    get: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 },
        clientId: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const key = `${this.settings.keyPrefix}:${ctx.params.canonicalAccountId}:${ctx.params.clientId}`;
        const raw = await this.redis.get(key);
        return raw ? JSON.parse(raw) : null;
      }
    },

    revoke: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 },
        clientId: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const key = `${this.settings.keyPrefix}:${ctx.params.canonicalAccountId}:${ctx.params.clientId}`;
        const raw = await this.redis.get(key);
        if (!raw) return { revoked: false };

        const record = JSON.parse(raw);
        record.revoked = true;
        record.updatedAt = nowEpochSec();
        await this.redis.set(key, JSON.stringify(record), 'EX', this.settings.ttlSec);
        return { revoked: true };
      }
    }
  }
};
