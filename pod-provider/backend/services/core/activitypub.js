const { ActivityPubService } = require('@semapps/activitypub');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [ActivityPubService],
  settings: {
    baseUri: CONFIG.BASE_URL,
    podProvider: true,
    queueServiceUrl: CONFIG.QUEUE_SERVICE_URL
  }
};
