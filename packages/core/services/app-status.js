const { getDatasetFromUri } = require('@semapps/ldp');

const AppStatusService = {
  name: 'app-status',
  dependencies: ['api'],
  started() {
    this.broker.call('api.addRoute', {
      route: {
        name: 'app-status',
        path: '/.well-known/app-status',
        authentication: true,
        aliases: {
          'GET /': 'app-status.get'
        }
      }
    });
  },
  actions: {
    async get(ctx) {
      let onlineBackend = true,
        remoteAppData;

      const appUri = ctx.meta.impersonatedUser ? ctx.meta.webId : ctx.params.appUri;
      const webId = ctx.meta.impersonatedUser || ctx.meta.webId;

      ctx.meta.dataset = getDatasetFromUri(webId);

      const installed = await ctx.call('app-registrations.isRegistered', { appUri, podOwner: webId });

      const localAppData = await ctx.call('ldp.remote.getStored', { resourceUri: appUri, webId });

      try {
        remoteAppData = await ctx.call('ldp.remote.getNetwork', { resourceUri: appUri, webId });
      } catch (e) {
        onlineBackend = false;
      }
      return {
        onlineBackend,
        installed,
        upgradeNeeded:
          onlineBackend && installed ? localAppData['dc:modified'] != remoteAppData['dc:modified'] : undefined
      };
    }
  }
};

module.exports = AppStatusService;
