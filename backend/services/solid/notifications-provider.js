const { NotificationProviderService } = require('@semapps/solid');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [NotificationProviderService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    queueServiceUrl: CONFIG.QUEUE_SERVICE_URL
  }
};
