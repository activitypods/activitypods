const { Errors } = require('moleculer');
const { MoleculerError } = Errors;

module.exports = {
  name: 'unified-account-api',
  dependencies: ['api', 'unified-account'],

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        path: '/',
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false } },
        aliases: {
          'POST /api/accounts/create': 'unified-account-api.create'
        }
      },
      toBottom: false
    });

    this.logger.info('[UnifiedAccount] Route POST /api/accounts/create registered');
  },

  actions: {
    async create(ctx) {
      try {
        ctx.meta.$statusCode = 201;
        return await ctx.call('unified-account.create', ctx.params);
      } catch (e) {
        const statusCode = Number.isFinite(Number(e.code)) ? Number(e.code) : 500;
        throw new MoleculerError(e.message || 'Unable to create account', statusCode, e.type || 'UNIFIED_ACCOUNT_CREATE_FAILED', {
          phase: e.data?.phase
        });
      }
    }
  }
};
