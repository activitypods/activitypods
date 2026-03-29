const Redis = require('ioredis');
const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;
const { randomToken, nowEpochSec, parseIntWithBounds } = require('../../utils/oauth-security');

module.exports = {
  name: 'oauth-refresh-session',

  settings: {
    redisUrl: process.env.SEMAPPS_REDIS_CACHE_URL || 'redis://localhost:6379',
    tokenPrefix: 'oauth:refresh',
    familyPrefix: 'oauth:refresh-family',
    ttlSec: parseIntWithBounds(process.env.OAUTH_REFRESH_TTL_SECONDS, 60 * 60 * 24 * 30, 300, 60 * 60 * 24 * 180, 'OAUTH_REFRESH_TTL_SECONDS'),
    encKeyHex: process.env.OAUTH_REFRESH_TOKEN_ENC_KEY_HEX || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
  },

  created() {
    this.redis = new Redis(this.settings.redisUrl);
    if (!/^[0-9a-fA-F]{64}$/.test(this.settings.encKeyHex)) {
      throw new Error('OAUTH_REFRESH_TOKEN_ENC_KEY_HEX must be 64 hex characters');
    }
    this.encKey = Buffer.from(this.settings.encKeyHex, 'hex');
  },

  async stopped() {
    if (this.redis) {
      await this.redis.quit().catch(() => this.redis.disconnect());
    }
  },

  actions: {
    issueRefreshToken: {
      params: {
        did: { type: 'string', min: 1 },
        canonicalAccountId: { type: 'string', min: 1 },
        clientId: { type: 'string', min: 1 },
        scope: { type: 'string', min: 1 },
        dpopJkt: { type: 'string', min: 8 },
        familyId: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const refreshToken = randomToken(32);
        const tokenId = randomToken(18);
        const familyId = ctx.params.familyId || randomToken(18);
        const now = nowEpochSec();

        const record = {
          tokenId,
          familyId,
          did: ctx.params.did,
          canonicalAccountId: ctx.params.canonicalAccountId,
          clientId: ctx.params.clientId,
          scope: ctx.params.scope,
          dpopJkt: ctx.params.dpopJkt,
          active: true,
          createdAt: now,
          expiresAt: now + this.settings.ttlSec
        };

        const encrypted = this.encrypt(record);

        const key = `${this.settings.tokenPrefix}:${tokenId}`;
        const familyKey = `${this.settings.familyPrefix}:${familyId}`;

        await this.redis.multi()
          .set(key, encrypted, 'EX', this.settings.ttlSec)
          .sadd(familyKey, tokenId)
          .expire(familyKey, this.settings.ttlSec)
          .set(this.refreshTokenLookupKey(refreshToken), tokenId, 'EX', this.settings.ttlSec)
          .exec();

        return {
          refreshToken,
          tokenId,
          familyId,
          expiresIn: this.settings.ttlSec
        };
      }
    },

    rotateRefreshToken: {
      params: {
        refreshToken: { type: 'string', min: 10 },
        dpopJkt: { type: 'string', min: 8 }
      },
      async handler(ctx) {
        const tokenId = await this.redis.get(this.refreshTokenLookupKey(ctx.params.refreshToken));
        if (!tokenId) {
          throw new MoleculerError('Invalid refresh token', 400, 'INVALID_GRANT');
        }

        const key = `${this.settings.tokenPrefix}:${tokenId}`;
        const raw = await this.redis.get(key);
        if (!raw) {
          throw new MoleculerError('Invalid refresh token', 400, 'INVALID_GRANT');
        }

        const record = this.decrypt(raw);
        if (!record.active) {
          await this.actions.revokeFamily({ familyId: record.familyId });
          throw new MoleculerError('Refresh token replay detected', 401, 'REFRESH_TOKEN_REPLAY_DETECTED');
        }

        if (record.dpopJkt !== ctx.params.dpopJkt) {
          throw new MoleculerError('Refresh token DPoP binding mismatch', 401, 'INVALID_DPOP_PROOF');
        }

        record.active = false;
        record.rotatedAt = nowEpochSec();
        await this.redis.set(key, this.encrypt(record), 'EX', Math.max(1, record.expiresAt - nowEpochSec()));

        const next = await this.actions.issueRefreshToken({
          did: record.did,
          canonicalAccountId: record.canonicalAccountId,
          clientId: record.clientId,
          scope: record.scope,
          dpopJkt: record.dpopJkt,
          familyId: record.familyId
        });

        return {
          previousTokenId: record.tokenId,
          ...next,
          did: record.did,
          canonicalAccountId: record.canonicalAccountId,
          clientId: record.clientId,
          scope: record.scope
        };
      }
    },

    revokeFamily: {
      params: {
        familyId: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const familyKey = `${this.settings.familyPrefix}:${ctx.params.familyId}`;
        const tokenIds = await this.redis.smembers(familyKey);
        if (!tokenIds.length) return { revoked: false, count: 0 };

        for (const tokenId of tokenIds) {
          const key = `${this.settings.tokenPrefix}:${tokenId}`;
          const raw = await this.redis.get(key);
          if (!raw) continue;
          const record = this.decrypt(raw);
          record.active = false;
          record.revokedAt = nowEpochSec();
          await this.redis.set(key, this.encrypt(record), 'EX', Math.max(1, record.expiresAt - nowEpochSec()));
        }

        return { revoked: true, count: tokenIds.length };
      }
    },

    introspectRefreshToken: {
      params: {
        refreshToken: { type: 'string', min: 10 }
      },
      async handler(ctx) {
        const tokenId = await this.redis.get(this.refreshTokenLookupKey(ctx.params.refreshToken));
        if (!tokenId) return null;
        const raw = await this.redis.get(`${this.settings.tokenPrefix}:${tokenId}`);
        if (!raw) return null;
        const record = this.decrypt(raw);
        return {
          active: Boolean(record.active),
          tokenId: record.tokenId,
          familyId: record.familyId,
          did: record.did,
          canonicalAccountId: record.canonicalAccountId,
          clientId: record.clientId,
          scope: record.scope,
          expiresAt: record.expiresAt
        };
      }
    }
  },

  methods: {
    refreshTokenLookupKey(refreshToken) {
      const hash = crypto.createHash('sha256').update(String(refreshToken), 'utf8').digest('hex');
      return `${this.settings.tokenPrefix}:lookup:${hash}`;
    },

    encrypt(payload) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.encKey, iv);
      const body = Buffer.from(JSON.stringify(payload), 'utf8');
      const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
      const tag = cipher.getAuthTag();
      return JSON.stringify({
        iv: iv.toString('base64url'),
        tag: tag.toString('base64url'),
        ciphertext: encrypted.toString('base64url')
      });
    },

    decrypt(value) {
      const parsed = JSON.parse(value);
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.encKey,
        Buffer.from(parsed.iv, 'base64url')
      );
      decipher.setAuthTag(Buffer.from(parsed.tag, 'base64url'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(parsed.ciphertext, 'base64url')),
        decipher.final()
      ]);
      return JSON.parse(decrypted.toString('utf8'));
    }
  }
};
