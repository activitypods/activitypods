'use strict';

const crypto = require('crypto');
const { Errors: WebErrors } = require('moleculer-web');

function parseBearerToken(authHeader) {
  if (!authHeader || typeof authHeader !== 'string') return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authHeader.trim());
  return match ? match[1] : null;
}

function safeTokenEquals(expected, provided) {
  if (!expected || !provided) return false;
  const exp = Buffer.from(String(expected), 'utf8');
  const got = Buffer.from(String(provided), 'utf8');
  const maxLen = Math.max(exp.length, got.length);
  const expPadded = Buffer.alloc(maxLen, 0);
  const gotPadded = Buffer.alloc(maxLen, 0);
  exp.copy(expPadded);
  got.copy(gotPadded);
  return crypto.timingSafeEqual(expPadded, gotPadded) && exp.length === got.length;
}

module.exports = {
  name: 'internal-moderation-case-api',

  dependencies: ['api', 'user-settings-api'],

  settings: {
    auth: {
      bearerToken: process.env.ACTIVITYPODS_TOKEN || process.env.INTERNAL_API_TOKEN || process.env.SIDECAR_TOKEN || ''
    },
    routePath: '/api/internal/moderation'
  },

  async started() {
    const bearerToken = this.settings.auth.bearerToken;

    if (!bearerToken) {
      this.logger.warn('[InternalModerationCaseApi] No internal bearer token configured; all requests will be rejected');
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'internal-moderation-case-api',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false, limit: '256kb' } },
        onBeforeCall: (ctx, route, req) => {
          const authHeader = (req.headers.authorization || req.headers.Authorization || '').trim();
          const token = parseBearerToken(authHeader);
          if (!safeTokenEquals(bearerToken, token)) {
            throw new WebErrors.UnAuthorizedError(WebErrors.ERR_INVALID_TOKEN, null, 'Unauthorized');
          }
          ctx.meta.$responseHeaders = {
            ...(ctx.meta.$responseHeaders || {}),
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY'
          };
        },
        aliases: {
          'POST /cases': 'internal-moderation-case-api.ingestCase',
          'GET /cases': 'internal-moderation-case-api.listCases',
          'GET /cases/:id': 'internal-moderation-case-api.getCase',
          'PATCH /cases/:id': 'internal-moderation-case-api.patchCase',
          'GET /cases/by-dedupe/:dedupeKey': 'internal-moderation-case-api.findCaseByDedupe'
        }
      },
      toBottom: false
    });

    this.logger.info('[InternalModerationCaseApi] Internal routes registered under /api/internal/moderation');
  },

  actions: {
    async ingestCase(ctx) {
      return ctx.call('user-settings-api.ingestModerationCaseInternal', ctx.params);
    },

    async listCases(ctx) {
      return ctx.call('user-settings-api.listModerationCasesInternal', { query: ctx.params || {} });
    },

    async getCase(ctx) {
      return ctx.call('user-settings-api.getModerationCaseInternal', ctx.params);
    },

    async patchCase(ctx) {
      const patch = { ...(ctx.params || {}) };
      delete patch.id;
      return ctx.call('user-settings-api.patchModerationCaseInternal', {
        id: ctx.params.id,
        patch
      });
    },

    async findCaseByDedupe(ctx) {
      return ctx.call('user-settings-api.findModerationCaseByDedupeInternal', ctx.params);
    }
  }
};
