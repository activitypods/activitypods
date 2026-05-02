module.exports = {
  name: 'provider-capabilities-api',
  dependencies: ['api', 'provider-capabilities'],

  settings: {
    routePath: '/.well-known/provider-capabilities'
  },

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        name: 'provider-capabilities',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        aliases: {
          'GET /': 'provider-capabilities-api.get'
        }
      },
      toBottom: false
    });

    this.logger.info(`[ProviderCapabilities] Route GET ${this.settings.routePath} registered`);
  },

  actions: {
    async get(ctx) {
      ctx.meta.$responseHeaders = {
        ...(ctx.meta.$responseHeaders || {}),
        'Content-Type': 'application/vnd.activitypods.provider-capabilities+json;version=1',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      };

      return ctx.call('provider-capabilities.getDocument');
    }
  }
};
