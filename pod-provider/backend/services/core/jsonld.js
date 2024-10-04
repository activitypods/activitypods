const path = require('path');
const { JsonLdService } = require('@semapps/jsonld');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [JsonLdService],
  settings: {
    baseUri: CONFIG.BASE_URL,
    cachedContextFiles: [
      {
        uri: 'https://www.w3.org/ns/activitystreams',
        file: path.resolve(__dirname, '../../config/context-as.json')
      }
    ]
  }
};
