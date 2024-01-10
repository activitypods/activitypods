const urlJoin = require('url-join');
const WebhookChannelService = require('./sub-services/webhook');

module.exports = {
  name: 'notification',
  settings: {
    baseUrl: null
  },
  dependencies: ['api', 'ldp.link-header'],
  async created() {
    const { baseUrl } = this.settings;
    this.broker.createService(WebhookChannelService, { baseUrl });
  },
  async started() {
    await this.broker.call('ldp.link-header.register', { actionName: 'notification.getLink' });

    await this.broker.call('api.addRoute', {
      route: {
        name: 'solid',
        path: '/.well-known/solid',
        authorization: false,
        authentication: false,
        aliases: {
          'GET /': 'notification.discover'
        }
      }
    });
  },
  actions: {
    discover(ctx) {
      // TODO Handle content negociation
      ctx.meta.$responseType = 'application/ld+json';
      return {
        '@context': { notify: 'http://www.w3.org/ns/solid/notifications#' },
        '@id': urlJoin(this.settings.baseUrl, '.well-known', 'solid'),
        '@type': 'http://www.w3.org/ns/pim/space#Storage',
        'notify:subscription': [
          urlJoin(this.settings.baseUrl, '.notifications', 'WebSocketChannel2023'),
          urlJoin(this.settings.baseUrl, '.notifications', 'WebhookChannel2023')
        ]
      };
    },
    getLink() {
      return {
        uri: urlJoin(this.settings.baseUrl, '.well-known', 'solid'),
        rel: 'http://www.w3.org/ns/solid/terms#storageDescription'
      };
    }
  }
};
