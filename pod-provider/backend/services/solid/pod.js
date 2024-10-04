const { PodService } = require('@semapps/solid');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [PodService],
  settings: {
    baseUrl: CONFIG.BASE_URL
  }
};
