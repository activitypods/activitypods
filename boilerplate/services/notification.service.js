const urlJoin = require('url-join');
const { SingleMailNotificationsService } = require('@semapps/notifications');
const QueueService = require('moleculer-bull');
const CONFIG = require('../config/config');
const transport = require('../config/transport');

module.exports = {
  mixins: CONFIG.QUEUE_SERVICE_URL
    ? [SingleMailNotificationsService, QueueService(CONFIG.QUEUE_SERVICE_URL)]
    : [SingleMailNotificationsService],
  settings: {
    defaultLocale: CONFIG.DEFAULT_LOCALE,
    defaultFrontUrl: CONFIG.FRONTEND_URL,
    color: CONFIG.FRONTEND_COLOR,
    delay: 120000, // Wait 2min to ensure AnnouncerService has cached resources
    // Moleculer-mail settings
    from: `${CONFIG.FROM_NAME} <${CONFIG.FROM_EMAIL}>`,
    transport,
  },
  methods: {
    async formatLink(link, recipientUri) {
      // In ActivityPods, all links are opened through the /openApp endpoint
      // The search param allows to specify the URI, the type and the mode
      return urlJoin(recipientUri, 'openApp') + link;
    }
  }
};
