const { NotificationsProviderService } = require('@semapps/solid');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [NotificationsProviderService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    settingsDataset: CONFIG.AUTH_ACCOUNTS_DATASET,
    queueServiceUrl: CONFIG.QUEUE_SERVICE_URL
  }
};
