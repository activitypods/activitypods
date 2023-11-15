const path = require('path');
const { CoreService } = require('@activitypods/core');
const CONFIG = require('../config/config');
const transport = require('../config/transport');

module.exports = {
  mixins: [CoreService],
  settings: {
    baseUrl: CONFIG.HOME_URL,
    baseDir: path.resolve(__dirname, '..'),
    frontendUrl: CONFIG.FRONTEND_URL,
    triplestore: {
      url: CONFIG.SPARQL_ENDPOINT,
      user: CONFIG.JENA_USER,
      password: CONFIG.JENA_PASSWORD
    },
    jsonContext: CONFIG.JSON_CONTEXT,
    queueServiceUrl: CONFIG.QUEUE_SERVICE_URL,
    redisOidcProviderUrl: CONFIG.REDIS_OIDC_PROVIDER_URL,
    authType: CONFIG.AUTH_TYPE,
    auth: {
      reservedUsernames: CONFIG.AUTH_RESERVED_USER_NAMES,
      accountsDataset: CONFIG.AUTH_ACCOUNTS_DATASET,
      issuer: CONFIG.AUTH_OIDC_ISSUER,
      clientId: CONFIG.AUTH_OIDC_CLIENT_ID,
      clientSecret: CONFIG.AUTH_OIDC_CLIENT_SECRET,
      mail: {
        from: `${CONFIG.FROM_NAME} <${CONFIG.FROM_EMAIL}>`,
        transport,
        defaults: {
          locale: CONFIG.DEFAULT_LOCALE,
          frontUrl: CONFIG.FRONTEND_URL
        }
      }
    },
    api: {
      port: CONFIG.PORT
    }
  }
};
