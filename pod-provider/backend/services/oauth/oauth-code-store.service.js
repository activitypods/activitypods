const Redis = require('ioredis');
const { MoleculerError } = require('moleculer').Errors;
const { randomToken, nowEpochSec, parseIntWithBounds } = require('../../utils/oauth-security');

module.exports = {
  name: 'oauth-code-store',

  settings: {
    redisUrl: process.env.SEMAPPS_REDIS_CACHE_URL || 'redis://localhost:6379',
    keyPrefix: 'oauth:code',
    usedPrefix: 'oauth:code-used',
    codeTtlSec: parseIntWithBounds(process.env.OAUTH_CODE_TTL_SECONDS, 90, 30, 300, 'OAUTH_CODE_TTL_SECONDS')
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
    issueCode: {
      params: {
        clientId: { type: 'string', min: 1 },
        redirectUri: { type: 'string', min: 1 },
        canonicalAccountId: { type: 'string', min: 1 },
        did: { type: 'string', min: 1 },
        scope: { type: 'string', min: 1 },
        dpopJkt: { type: 'string', min: 8 },
        codeChallenge: { type: 'string', min: 43, max: 128 },
        codeChallengeMethod: { type: 'string', min: 1 },
        state: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const code = randomToken(24);
        const now = nowEpochSec();
        const record = {
          clientId: ctx.params.clientId,
          redirectUri: ctx.params.redirectUri,
          canonicalAccountId: ctx.params.canonicalAccountId,
          did: ctx.params.did,
          scope: ctx.params.scope,
          dpopJkt: ctx.params.dpopJkt,
          codeChallenge: ctx.params.codeChallenge,
          codeChallengeMethod: ctx.params.codeChallengeMethod,
          state: ctx.params.state || undefined,
          createdAt: now,
          expiresAt: now + this.settings.codeTtlSec
        };

        await this.redis.set(`${this.settings.keyPrefix}:${code}`, JSON.stringify(record), 'EX', this.settings.codeTtlSec);
        return { code, expiresIn: this.settings.codeTtlSec };
      }
    },

    consumeCode: {
      params: {
        code: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const code = String(ctx.params.code).trim();
        const codeKey = `${this.settings.keyPrefix}:${code}`;
        const usedKey = `${this.settings.usedPrefix}:${code}`;

        const used = await this.redis.exists(usedKey);
        if (used === 1) {
          throw new MoleculerError('Authorization code already used', 400, 'AUTHORIZATION_CODE_ALREADY_USED');
        }

        const payload = await this.redis.get(codeKey);
        if (!payload) {
          throw new MoleculerError('Invalid authorization code', 400, 'INVALID_AUTHORIZATION_CODE');
        }

        const record = JSON.parse(payload);
        await this.redis.multi()
          .del(codeKey)
          .set(usedKey, '1', 'EX', this.settings.codeTtlSec)
          .exec();

        return record;
      }
    }
  }
};
