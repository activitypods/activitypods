const { EndpointService } = require('@semapps/solid');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [EndpointService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    settingsDataset: CONFIG.AUTH_ACCOUNTS_DATASET
  }
};
