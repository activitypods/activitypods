const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;

module.exports = {
  name: 'atproto-migration-api',

  dependencies: ['api', 'auth.account', 'atproto-migration'],

  settings: {
    routePath: '/api/accounts/migrate-atproto',
    recentReauthWindowSec: Math.max(60, Math.min(Number(process.env.ATPROTO_MIGRATION_RECENT_REAUTH_WINDOW_SEC) || 300, 1800))
  },

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        name: 'atproto-migration-api',
        path: this.settings.routePath,
        authorization: true,
        authentication: true,
        bodyParsers: {
          json: { strict: false },
          urlencoded: { extended: false }
        },
        onBeforeCall: (ctx, route, req) => {
          ctx.meta.$headers = req.headers;
          ctx.meta.$query = req.query;
          const requestId = this.sanitizeCorrelationId(req.headers['x-request-id'] || req.headers['X-Request-Id']);
          ctx.meta.correlationId = requestId;
          ctx.meta.$responseHeaders = {
            ...(ctx.meta.$responseHeaders || {}),
            'X-Request-Id': requestId,
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
            'X-Content-Type-Options': 'nosniff'
          };
        },
        aliases: {
          'POST /': 'atproto-migration-api.start',
          'GET /status': 'atproto-migration-api.status',
          'POST /confirm': 'atproto-migration-api.confirm',
          'POST /cancel': 'atproto-migration-api.cancel',
          'POST /resume': 'atproto-migration-api.resume',
          'POST /rollback': 'atproto-migration-api.rollback'
        }
      },
      toBottom: false
    });

    this.logger.info('[AtprotoMigrationApi] Routes registered under /api/accounts/migrate-atproto');
  },

  actions: {
    start: {
      async handler(ctx) {
        const ownerWebId = this.requireAuthenticatedWebId(ctx);
        const canonicalAccountId = this.resolveCanonicalAccountId(ctx, ownerWebId);
        this.assertOwner(ownerWebId, canonicalAccountId);

        const result = await ctx.call('atproto-migration.startMigration', {
          canonicalAccountId,
          dryRun: this.asBoolean(ctx.params?.dryRun, false),
          migrateBlobs: this.asBoolean(ctx.params?.migrateBlobs, true),
          migratePreferences: this.asBoolean(ctx.params?.migratePreferences, true),
          oldPdsUrl: this.optionalString(ctx.params?.oldPdsUrl),
          newPdsUrl: this.optionalString(ctx.params?.newPdsUrl),
          sourceAccessToken: this.optionalString(ctx.params?.sourceAccessToken),
          initiatedBy: ownerWebId
        }, {
          meta: {
            ...ctx.meta,
            initiatedBy: ownerWebId,
            correlationId: ctx.meta.correlationId
          }
        });

        ctx.meta.$statusCode = 202;
        return result;
      }
    },

    status: {
      async handler(ctx) {
        const ownerWebId = this.requireAuthenticatedWebId(ctx);
        const canonicalAccountId = this.resolveCanonicalAccountId(ctx, ownerWebId);
        this.assertOwner(ownerWebId, canonicalAccountId);

        return ctx.call('atproto-migration.getMigrationStatus', {
          canonicalAccountId
        }, {
          meta: {
            ...ctx.meta,
            initiatedBy: ownerWebId,
            correlationId: ctx.meta.correlationId
          }
        });
      }
    },

    confirm: {
      async handler(ctx) {
        const ownerWebId = this.requireAuthenticatedWebId(ctx);
        const canonicalAccountId = this.resolveCanonicalAccountId(ctx, ownerWebId);
        this.assertOwner(ownerWebId, canonicalAccountId);

        const password = String(ctx.params?.password || '');
        if (!password) {
          throw new MoleculerError('password is required for migration confirmation', 400, 'ATPROTO_MIGRATION_REQUIRES_CONFIRMATION');
        }

        await this.verifyRecentReauth(canonicalAccountId, password);

        await ctx.call('atproto-migration.confirmMigration', {
          canonicalAccountId
        }, {
          meta: {
            ...ctx.meta,
            initiatedBy: ownerWebId,
            correlationId: ctx.meta.correlationId
          }
        });

        const resumed = await ctx.call('atproto-migration.resumeMigration', {
          canonicalAccountId,
          migrateBlobs: this.asBoolean(ctx.params?.migrateBlobs, true),
          migratePreferences: this.asBoolean(ctx.params?.migratePreferences, true),
          sourceAccessToken: this.optionalString(ctx.params?.sourceAccessToken)
        }, {
          meta: {
            ...ctx.meta,
            initiatedBy: ownerWebId,
            correlationId: ctx.meta.correlationId
          }
        });

        return {
          ...resumed,
          reauthWindowSec: this.settings.recentReauthWindowSec
        };
      }
    },

    resume: {
      async handler(ctx) {
        const ownerWebId = this.requireAuthenticatedWebId(ctx);
        const canonicalAccountId = this.resolveCanonicalAccountId(ctx, ownerWebId);
        this.assertOwner(ownerWebId, canonicalAccountId);

        return ctx.call('atproto-migration.resumeMigration', {
          canonicalAccountId,
          migrateBlobs: this.asBoolean(ctx.params?.migrateBlobs, true),
          migratePreferences: this.asBoolean(ctx.params?.migratePreferences, true),
          sourceAccessToken: this.optionalString(ctx.params?.sourceAccessToken)
        }, {
          meta: {
            ...ctx.meta,
            initiatedBy: ownerWebId,
            correlationId: ctx.meta.correlationId
          }
        });
      }
    },

    cancel: {
      async handler(ctx) {
        const ownerWebId = this.requireAuthenticatedWebId(ctx);
        const canonicalAccountId = this.resolveCanonicalAccountId(ctx, ownerWebId);
        this.assertOwner(ownerWebId, canonicalAccountId);

        const result = await ctx.call('atproto-migration.rollbackMigration', {
          canonicalAccountId
        }, {
          meta: {
            ...ctx.meta,
            initiatedBy: ownerWebId,
            correlationId: ctx.meta.correlationId
          }
        });

        return {
          ...result,
          cancelled: true
        };
      }
    },

    rollback: {
      async handler(ctx) {
        return this.actions.cancel.handler(ctx);
      }
    }
  },

  methods: {
    sanitizeCorrelationId(value) {
      const normalized = String(value || '').trim();
      return normalized ? normalized.replace(/[^\w.-]/g, '').slice(0, 128) : crypto.randomUUID();
    },

    requireAuthenticatedWebId(ctx) {
      const webId = String(ctx.meta?.webId || '').trim();
      if (!webId || webId === 'anon') {
        throw new MoleculerError('Authentication required', 401, 'LOGIN_REQUIRED');
      }
      return webId;
    },

    resolveCanonicalAccountId(ctx, ownerWebId) {
      const raw = ctx.params?.canonicalAccountId ?? ctx.meta?.$query?.canonicalAccountId;
      const canonicalAccountId = String(raw || ownerWebId).trim();
      if (!canonicalAccountId) {
        throw new MoleculerError('canonicalAccountId is required', 400, 'INVALID_REQUEST');
      }
      return canonicalAccountId;
    },

    assertOwner(ownerWebId, canonicalAccountId) {
      if (String(ownerWebId).trim() !== String(canonicalAccountId).trim()) {
        throw new MoleculerError('Canonical account ownership mismatch', 403, 'ACCESS_DENIED');
      }
    },

    async verifyRecentReauth(canonicalAccountId, password) {
      const account = await this.broker.call('auth.account.findByWebId', {
        webId: canonicalAccountId
      });

      if (!account?.username) {
        throw new MoleculerError('Account not found', 404, 'ACTIVITYPODS_ACCOUNT_NOT_FOUND');
      }

      try {
        await this.broker.call('auth.account.verify', {
          username: account.username,
          password: String(password)
        });
      } catch (_error) {
        throw new MoleculerError('Recent re-authentication failed', 401, 'ATPROTO_MIGRATION_REQUIRES_CONFIRMATION');
      }
    },

    asBoolean(value, fallback) {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0') return false;
      }
      if (value === undefined || value === null || value === '') return fallback;
      throw new MoleculerError('Invalid boolean value', 400, 'INVALID_REQUEST');
    },

    optionalString(value) {
      const normalized = String(value || '').trim();
      return normalized || undefined;
    }
  }
};