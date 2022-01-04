const path = require('path');
const { CoreService } = require('@activitypods/core');
const CONFIG = require('../config/config');

module.exports = {
  mixins: [CoreService],
  settings: {
    baseUrl: CONFIG.HOME_URL,
    baseDir: path.resolve(__dirname, '..'),
    fuseki: {
      url: CONFIG.SPARQL_ENDPOINT,
      user: CONFIG.JENA_USER,
      password: CONFIG.JENA_PASSWORD,
    },
    jsonContext: CONFIG.JSON_CONTEXT,
    queueServiceUrl: CONFIG.QUEUE_SERVICE_URL
  },
};
