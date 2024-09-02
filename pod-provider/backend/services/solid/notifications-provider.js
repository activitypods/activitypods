const { NotificationsProviderService } = require('@semapps/solid');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [NotificationsProviderService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    queueServiceUrl: CONFIG.QUEUE_SERVICE_URL
  }
};
