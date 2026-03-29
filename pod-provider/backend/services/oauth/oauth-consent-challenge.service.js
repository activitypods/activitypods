const Redis = require('ioredis');
const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;
const { randomToken, nowEpochSec, parseIntWithBounds } = require('../../utils/oauth-security');

function sha256(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

module.exports = {
  name: 'oauth-consent-challenge',

  settings: {
    redisUrl: process.env.SEMAPPS_REDIS_CACHE_URL || 'redis://localhost:6379',
    keyPrefix: 'oauth:consent-challenge',
    ttlSec: parseIntWithBounds(process.env.OAUTH_CONSENT_CHALLENGE_TTL_SECONDS, 300, 30, 900, 'OAUTH_CONSENT_CHALLENGE_TTL_SECONDS')
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
    mint: {
      params: {
        requestUri: { type: 'string', min: 1 },
        fingerprint: { type: 'string', min: 8 },
        csrfToken: { type: 'string', min: 16 },
        expiresAt: { type: 'number', integer: true, positive: true, optional: true }
      },
      async handler(ctx) {
        const now = nowEpochSec();
        const challengeId = randomToken(24);
        const expiresAt = ctx.params.expiresAt || (now + this.settings.ttlSec);
        const ttlSec = Math.max(1, Math.min(this.settings.ttlSec, expiresAt - now));
        const record = {
          challengeId,
          requestUri: ctx.params.requestUri,
          fingerprint: ctx.params.fingerprint,
          csrfHash: sha256(ctx.params.csrfToken),
          createdAt: now,
          expiresAt: now + ttlSec
        };
        await this.redis.set(`${this.settings.keyPrefix}:${challengeId}`, JSON.stringify(record), 'EX', ttlSec);
        return record;
      }
    },

    consume: {
      params: {
        challengeId: { type: 'string', min: 8 }
      },
      async handler(ctx) {
        const key = `${this.settings.keyPrefix}:${ctx.params.challengeId}`;
        const raw = await this.redis.get(key);
        if (!raw) return null;
        await this.redis.del(key);
        return JSON.parse(raw);
      }
    },

    verifyCsrf: {
      params: {
        expectedHash: { type: 'string', min: 32 },
        csrfToken: { type: 'string', min: 16 }
      },
      async handler(ctx) {
        const actualHash = sha256(ctx.params.csrfToken);
        return crypto.timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(ctx.params.expectedHash, 'hex'));
      }
    }
  }
};
