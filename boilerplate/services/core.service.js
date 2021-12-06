const path = require("path");
const urlJoin = require("url-join");
const { CoreService } = require('@activitypods/core');
const CONFIG = require('../config');

module.exports = {
  mixins: [CoreService],
  settings: {
    baseUrl: CONFIG.HOME_URL,
    baseDir: path.resolve(__dirname, '..'),
    fuseki: {
      url: CONFIG.SPARQL_ENDPOINT,
      user: CONFIG.JENA_USER,
      password: CONFIG.JENA_PASSWORD
    },
    // jsonContext: urlJoin(CONFIG.COMMON_DATA_URL, 'context.json')
  }
};
