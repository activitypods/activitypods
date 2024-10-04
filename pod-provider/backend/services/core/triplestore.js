const { TripleStoreService } = require('@semapps/triplestore');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [TripleStoreService],
  settings: {
    url: CONFIG.SPARQL_ENDPOINT,
    user: CONFIG.JENA_USER,
    password: CONFIG.JENA_PASSWORD,
    fusekiBase: CONFIG.FUSEKI_BASE
  }
};
