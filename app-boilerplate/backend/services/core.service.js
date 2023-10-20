const path = require('path');
const urlJoin = require('url-join');
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
      port: CONFIG.PORT,
      routes: [
        {
          name: 'auth-callback',
          path: '/auth-callback',
          aliases: {
            'GET /': 'core.redirectToAuthCallback'
          }
        }
      ]
    },
    void: false
  },
  actions: {
    // Used when connecting directly from the Pod provider app list, as it doesn't know the front URL
    redirectToAuthCallback(ctx) {
      const callbackUrl = new URL(urlJoin(CONFIG.FRONT_URL, 'auth-callback'));
      if (ctx.params) {
        for (const [key, value] of Object.entries(ctx.params)) {
          callbackUrl.searchParams.set(key, value);
        }
      }
      ctx.meta.$statusCode = 302;
      ctx.meta.$location = callbackUrl.toString();
    }
  }
};
