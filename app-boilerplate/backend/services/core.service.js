const path = require('path');
const { CoreService } = require('@semapps/core');
const CONFIG = require('../config/config');

module.exports = {
  mixins: [CoreService],
  settings: {
    baseUrl: CONFIG.HOME_URL,
    baseDir: path.resolve(__dirname, '..'),
    triplestore: {
      url: CONFIG.SPARQL_ENDPOINT,
      user: CONFIG.JENA_USER,
      password: CONFIG.JENA_PASSWORD,
      mainDataset: CONFIG.MAIN_DATASET
    },
    jsonContext: CONFIG.JSON_CONTEXT,
    api: {
      port: CONFIG.PORT
    },
    ldp: {
      resourcesWithContainerPath: false
    },
    void: false
  }
};
