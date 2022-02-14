const { NotificationService } = require('@activitypods/notification');
const QueueService = require('moleculer-bull');
const CONFIG = require('../config/config');
const transport = require('../config/transport');

module.exports = {
  mixins: CONFIG.QUEUE_SERVICE_URL
    ? [NotificationService, QueueService(CONFIG.QUEUE_SERVICE_URL)]
    : [NotificationService],
  settings: {
    from: `${CONFIG.FROM_NAME} <${CONFIG.FROM_EMAIL}>`,
    transport,
    defaults: {
      locale: CONFIG.NOTIFICATIONS_DEFAULT_LOCALE,
      frontUrl: CONFIG.NOTIFICATIONS_DEFAULT_FRONT_URL,
    },
  },
};
