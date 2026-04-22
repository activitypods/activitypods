'use strict';

const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;

module.exports = {
  name: 'moderation-api',

  dependencies: ['api', 'user-settings-api'],

  settings: {
    routePath: '/api/moderation'
  },

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        name: 'moderation-api',
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
          'POST /reports': 'moderation-api.createReport',
          'GET /reports': 'moderation-api.listReports',
          'GET /reports/:id': 'moderation-api.getReport',
          'GET /actions': 'moderation-api.listActions'
        }
      },
      toBottom: false
    });

    this.logger.info('[ModerationApi] Routes registered under /api/moderation');
  },

  actions: {
    createReport: {
      async handler(ctx) {
        this.requireAuthenticatedWebId(ctx);
        return ctx.call('user-settings-api.createModerationReport', ctx.params, {
          meta: { ...ctx.meta, correlationId: ctx.meta.correlationId }
        });
      }
    },

    listReports: {
      async handler(ctx) {
        this.requireAuthenticatedWebId(ctx);
        return ctx.call('user-settings-api.listOwnerModerationCases', { query: ctx.params || {} }, {
          meta: { ...ctx.meta, $query: ctx.meta.$query || ctx.params || {}, correlationId: ctx.meta.correlationId }
        });
      }
    },

    getReport: {
      async handler(ctx) {
        this.requireAuthenticatedWebId(ctx);
        return ctx.call('user-settings-api.getOwnerModerationCase', ctx.params, {
          meta: { ...ctx.meta, correlationId: ctx.meta.correlationId }
        });
      }
    },

    listActions: {
      async handler(ctx) {
        this.requireAuthenticatedWebId(ctx);
        return ctx.call('user-settings-api.listOwnerModerationDecisions', { query: ctx.params || {} }, {
          meta: { ...ctx.meta, $query: ctx.meta.$query || ctx.params || {}, correlationId: ctx.meta.correlationId }
        });
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
    }
  }
};
