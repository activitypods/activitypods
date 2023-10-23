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
          name: 'redirect',
          path: '/r',
          aliases: {
            'GET /': 'core.redirectToResource'
          }
        },
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
    // Used when accessing a particular type of resource, as we don't know the app front URL
    redirectToResource(ctx) {
      const frontUrl = new URL(urlJoin(CONFIG.FRONT_URL, 'r'));
      if (ctx.params) {
        for (const [key, value] of Object.entries(ctx.params)) {
          frontUrl.searchParams.set(key, value);
        }
      }
      ctx.meta.$statusCode = 302;
      ctx.meta.$location = frontUrl.toString();
    },
    // Used when connecting directly from the Pod provider app list, as we don't know the app front URL
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
