const Redis = require('ioredis');
const { MoleculerError } = require('moleculer').Errors;
const { fetchJsonWithRetry } = require('../../utils/oauth-http');
const {
  sha256,
  nowEpochSec,
  parseBoolean,
  parseIntWithBounds,
  assertHttpsUrl
} = require('../../utils/oauth-security');

module.exports = {
  name: 'oauth-client-metadata',

  settings: {
    redisUrl: process.env.SEMAPPS_REDIS_CACHE_URL || 'redis://localhost:6379',
    cachePrefix: 'oauth:clientmeta',
    cacheTtlSec: parseIntWithBounds(process.env.OAUTH_CLIENT_METADATA_CACHE_TTL_SECONDS, 3600, 30, 86400, 'OAUTH_CLIENT_METADATA_CACHE_TTL_SECONDS'),
    timeoutMs: parseIntWithBounds(process.env.OAUTH_CLIENT_METADATA_TIMEOUT_MS, 5000, 500, 20000, 'OAUTH_CLIENT_METADATA_TIMEOUT_MS'),
    maxAttempts: parseIntWithBounds(process.env.OAUTH_CLIENT_METADATA_MAX_ATTEMPTS, 5, 1, 8, 'OAUTH_CLIENT_METADATA_MAX_ATTEMPTS'),
    allowLocalhostHttp: parseBoolean(process.env.OAUTH_ENABLE_LOCALHOST_DEV, false)
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
    resolveClientMetadata: {
      params: {
        clientId: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const clientId = String(ctx.params.clientId).trim();
        const parsedUrl = assertHttpsUrl(clientId, {
          allowLocalhostHttp: this.settings.allowLocalhostHttp,
          field: 'client_id'
        });

        const cacheKey = `${this.settings.cachePrefix}:${sha256(clientId)}`;
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.metadata) {
            return parsed.metadata;
          }
        }

        let metadata;
        try {
          metadata = await fetchJsonWithRetry(parsedUrl.toString(), {
            timeoutMs: this.settings.timeoutMs,
            maxAttempts: this.settings.maxAttempts,
            baseDelayMs: 250,
            maxDelayMs: 5000,
            allowLocalhostHttp: this.settings.allowLocalhostHttp
          });
        } catch (error) {
          const type = String(error && error.name ? error.name : 'Error').toLowerCase();
          if (type.includes('abort')) {
            throw new MoleculerError('Client metadata fetch timed out', 504, 'CLIENT_METADATA_TIMEOUT');
          }
          throw new MoleculerError('Client metadata fetch failed', 502, 'CLIENT_METADATA_FETCH_FAILED');
        }

        const normalized = this.validateAndNormalizeMetadata(metadata, clientId);

        const now = nowEpochSec();
        const envelope = {
          client_id: clientId,
          metadata: normalized,
          fetchedAt: now,
          expiresAt: now + this.settings.cacheTtlSec
        };

        await this.redis.set(cacheKey, JSON.stringify(envelope), 'EX', this.settings.cacheTtlSec);

        return normalized;
      }
    },

    getCachedByHash: {
      params: {
        hash: { type: 'string', min: 8 }
      },
      async handler(ctx) {
        const key = `${this.settings.cachePrefix}:${String(ctx.params.hash).trim()}`;
        const cached = await this.redis.get(key);
        if (!cached) return null;
        const parsed = JSON.parse(cached);
        return parsed || null;
      }
    }
  },

  methods: {
    validateAndNormalizeMetadata(metadata, clientId) {
      if (!metadata || typeof metadata !== 'object') {
        throw new MoleculerError('Invalid client metadata payload', 400, 'INVALID_CLIENT_METADATA');
      }

      if (String(metadata.client_id || '').trim() !== clientId) {
        throw new MoleculerError('client_id must match metadata URL', 400, 'INVALID_CLIENT_METADATA');
      }

      const grantTypes = Array.isArray(metadata.grant_types) ? metadata.grant_types.map(String) : [];
      const responseTypes = Array.isArray(metadata.response_types) ? metadata.response_types.map(String) : [];
      const redirectUris = Array.isArray(metadata.redirect_uris) ? metadata.redirect_uris.map(v => String(v).trim()) : [];
      const scope = String(metadata.scope || '');

      if (!grantTypes.includes('authorization_code')) {
        throw new MoleculerError('grant_types must include authorization_code', 400, 'INVALID_CLIENT_METADATA');
      }
      if (!responseTypes.includes('code')) {
        throw new MoleculerError('response_types must include code', 400, 'INVALID_CLIENT_METADATA');
      }
      if (!scope.split(/\s+/).filter(Boolean).includes('atproto')) {
        throw new MoleculerError('scope must include atproto', 400, 'INVALID_CLIENT_METADATA');
      }
      if (redirectUris.length === 0) {
        throw new MoleculerError('redirect_uris must not be empty', 400, 'INVALID_CLIENT_METADATA');
      }

      for (const redirectUri of redirectUris) {
        assertHttpsUrl(redirectUri, {
          allowLocalhostHttp: this.settings.allowLocalhostHttp,
          field: 'redirect_uri'
        });
      }

      if (metadata.dpop_bound_access_tokens !== true) {
        throw new MoleculerError('dpop_bound_access_tokens must be true', 400, 'INVALID_CLIENT_METADATA');
      }

      const authMethod = metadata.token_endpoint_auth_method
        ? String(metadata.token_endpoint_auth_method)
        : 'none';

      if (authMethod === 'private_key_jwt' && !metadata.jwks && !metadata.jwks_uri) {
        throw new MoleculerError('private_key_jwt clients must publish jwks or jwks_uri', 400, 'INVALID_CLIENT_METADATA');
      }

      return {
        ...metadata,
        client_id: clientId,
        grant_types: grantTypes,
        response_types: responseTypes,
        redirect_uris: redirectUris,
        scope,
        token_endpoint_auth_method: authMethod
      };
    }
  }
};
