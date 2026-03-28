const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;
const { Errors: WebErrors } = require('moleculer-web');

module.exports = {
  name: 'internal-atproto-repair-api',

  dependencies: ['api', 'atproto-repair-provisioning'],

  settings: {
    auth: {
      bearerToken:
        process.env.ACTIVITYPODS_TOKEN ||
        process.env.INTERNAL_API_TOKEN ||
        process.env.SIDECAR_TOKEN ||
        ''
    },
    routePath: '/api/internal/atproto'
  },

  async started() {
    const bearerToken = this.settings.auth.bearerToken;

    if (!bearerToken) {
      this.logger.warn('[AtprotoRepairApi] No internal bearer token configured; all requests will be rejected');
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'atproto-repair-internal',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: true },
        onBeforeCall: (ctx, route, req, res) => {
          const authHeader = req.headers.authorization || req.headers.Authorization || '';
          const token = this.parseBearerToken(authHeader);
          if (!this.safeTokenEquals(bearerToken, token)) {
            throw new WebErrors.UnAuthorizedError(
              WebErrors.ERR_INVALID_TOKEN,
              null,
              'Unauthorized'
            );
          }

          const requestId = this.sanitizeRequestId(
            req.headers['x-request-id'] || req.headers['X-Request-Id']
          );
          ctx.meta.internalRequestId = requestId;
          ctx.meta.$responseHeaders = {
            ...(ctx.meta.$responseHeaders || {}),
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
            'X-Content-Type-Options': 'nosniff',
            'X-Request-Id': requestId
          };
        },
        aliases: {
          'GET /repair': 'internal-atproto-repair-api.repairGet',
          'POST /repair': 'internal-atproto-repair-api.repairPost',
          'POST /repair/backfill': 'internal-atproto-repair-api.backfillPost'
        }
      },
      toBottom: false
    });

    this.logger.info('[AtprotoRepairApi] Internal ATProto repair routes registered under /api/internal/atproto');
  },

  actions: {
    repairGet: {
      async handler(ctx) {
        const canonicalAccountId = this.getQueryValue(ctx, 'canonicalAccountId', 4096);
        if (!canonicalAccountId) {
          throw new MoleculerError('Missing canonicalAccountId', 400, 'INVALID_INPUT');
        }

        const dryRun = this.getBooleanValue(ctx.params?.dryRun, true);
        const force = this.getBooleanValue(ctx.params?.force, false);

        return ctx.call('atproto-repair-provisioning.repairProvisionedAccount', {
          canonicalAccountId,
          dryRun,
          force
        });
      }
    },

    repairPost: {
      async handler(ctx) {
        const canonicalAccountId = this.getBodyString(ctx, 'canonicalAccountId', 4096);
        if (!canonicalAccountId) {
          throw new MoleculerError('Missing canonicalAccountId', 400, 'INVALID_INPUT');
        }

        const dryRun = this.getBooleanValue(ctx.params?.dryRun, false);
        const force = this.getBooleanValue(ctx.params?.force, false);

        return ctx.call('atproto-repair-provisioning.repairProvisionedAccount', {
          canonicalAccountId,
          dryRun,
          force
        });
      }
    },

    backfillPost: {
      async handler(ctx) {
        const since = this.getBodyString(ctx, 'since', 2048, true);
        const limit = this.getNumericValue(ctx.params?.limit, 100, 1, 500);
        const dryRun = this.getBooleanValue(ctx.params?.dryRun, true);
        const force = this.getBooleanValue(ctx.params?.force, false);

        return ctx.call('atproto-repair-provisioning.backfillLegacyRepoBootstrap', {
          since,
          limit,
          dryRun,
          force
        });
      }
    }
  },

  methods: {
    parseBearerToken(authHeader) {
      if (!authHeader || typeof authHeader !== 'string') return null;
      const [scheme, token] = authHeader.split(' ');
      if (scheme !== 'Bearer' || !token) return null;
      return token.trim();
    },

    safeTokenEquals(expected, provided) {
      if (!expected || !provided) return false;
      const expectedBuffer = Buffer.from(String(expected), 'utf8');
      const providedBuffer = Buffer.from(String(provided), 'utf8');
      if (expectedBuffer.length !== providedBuffer.length) return false;
      return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
    },

    sanitizeRequestId(value) {
      const normalized = typeof value === 'string' ? value.trim() : '';
      if (!normalized) return crypto.randomUUID();
      return normalized.replace(/[^\w.-]/g, '').slice(0, 128) || crypto.randomUUID();
    },

    getQueryValue(ctx, key, maxLength) {
      return this.normalizeStringValue(ctx.params?.[key], key, maxLength, false);
    },

    getBodyString(ctx, key, maxLength, optional = false) {
      return this.normalizeStringValue(ctx.params?.[key], key, maxLength, optional);
    },

    normalizeStringValue(value, key, maxLength, optional) {
      const normalized = Array.isArray(value)
        ? String(value[0] || '').trim()
        : value === null || value === undefined
          ? ''
          : String(value).trim();

      if (!normalized) {
        return optional ? '' : '';
      }

      if (normalized.length > maxLength) {
        throw new MoleculerError(`Field "${key}" is too long`, 400, 'INVALID_INPUT');
      }

      return normalized;
    },

    getBooleanValue(value, fallback) {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0') return false;
      }
      if (value === undefined || value === null || value === '') {
        return fallback;
      }
      throw new MoleculerError('Invalid boolean value', 400, 'INVALID_INPUT');
    },

    getNumericValue(value, fallback, min, max) {
      if (value === undefined || value === null || value === '') return fallback;
      const numeric = Number(value);
      if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
        throw new MoleculerError('Invalid numeric value', 400, 'INVALID_INPUT');
      }
      return numeric;
    }
  }
};
