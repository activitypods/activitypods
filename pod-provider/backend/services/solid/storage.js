const { StorageService } = require('@semapps/solid');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [StorageService],
  settings: {
    baseUrl: CONFIG.BASE_URL
  }
};
