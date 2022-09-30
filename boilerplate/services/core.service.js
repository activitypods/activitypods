const path = require('path');
const { CoreService } = require('@activitypods/core');
const CONFIG = require('../config/config');
const transport = require('../config/transport');

module.exports = {
  mixins: [CoreService],
  settings: {
    baseUrl: CONFIG.HOME_URL,
    baseDir: path.resolve(__dirname, '..'),
    triplestore: {
      url: CONFIG.SPARQL_ENDPOINT,
      user: CONFIG.JENA_USER,
      password: CONFIG.JENA_PASSWORD,
    },
    jsonContext: CONFIG.JSON_CONTEXT,
    queueServiceUrl: CONFIG.QUEUE_SERVICE_URL,
    auth: {
      reservedUsernames: CONFIG.AUTH_RESERVED_USER_NAMES,
      accountsDataset: CONFIG.AUTH_ACCOUNTS_DATASET,
      mail: {
        from: `${CONFIG.FROM_NAME} <${CONFIG.FROM_EMAIL}>`,
        transport,
        defaults: {
          locale: CONFIG.NOTIFICATIONS_DEFAULT_LOCALE,
          frontUrl: CONFIG.NOTIFICATIONS_DEFAULT_FRONT_URL,
        },
      },
    },
  },
};
