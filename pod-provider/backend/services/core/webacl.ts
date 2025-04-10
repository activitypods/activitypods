const { WebAclService } = require('@semapps/webacl');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [WebAclService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    podProvider: true
  }
};
