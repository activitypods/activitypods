module.exports = {
  name: 'config',
  dependencies: ['api'],
  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        path: '/.well-known/config.js',
        name: 'config',
        aliases: {
          'GET /': 'config.get'
        }
      }
    });
  },
  actions: {
    async get(ctx) {
      ctx.meta.$responseType = 'text/javascript';
      return `
        window.CONFIG = {
          backend_url: "${process.env.SEMAPPS_HOME_URL}",
          mapbox_access_token: "${process.env.SEMAPPS_MAPBOX_ACCESS_TOKEN}",
        };
      `;
    }
  }
};
