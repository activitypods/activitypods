const { SingleMailNotificationsService } = require('@semapps/notifications');
const QueueService = require('moleculer-bull');
const CONFIG = require('../config/config');
const transport = require('../config/transport');

module.exports = {
  mixins: CONFIG.QUEUE_SERVICE_URL
    ? [SingleMailNotificationsService, QueueService(CONFIG.QUEUE_SERVICE_URL)]
    : [SingleMailNotificationsService],
  settings: {
    defaultLocale: CONFIG.NOTIFICATIONS_DEFAULT_LOCALE,
    defaultFrontUrl: CONFIG.NOTIFICATIONS_DEFAULT_FRONT_URL,
    // Moleculer-mail settings
    from: `${CONFIG.FROM_NAME} <${CONFIG.FROM_EMAIL}>`,
    transport,
  },
};
