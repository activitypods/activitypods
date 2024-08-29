const { WebfingerService } = require('@semapps/webfinger');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [WebfingerService],
  settings: {
    baseUrl: CONFIG.BASE_URL
  }
};
