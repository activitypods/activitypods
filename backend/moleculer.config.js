const { WebAclMiddleware, CacherMiddleware } = require('@semapps/webacl');
const { ObjectsWatcherMiddleware } = require('@semapps/sync');
const AppControlMiddleware = require('./middlewares/app-control');
const CONFIG = require('./config/config');
const errorHandler = require('./config/errorHandler');

Error.stackTraceLimit = Infinity;

// Use the cacher only if Redis is configured
const cacherConfig = CONFIG.REDIS_CACHE_URL
  ? {
      type: 'Redis',
      options: {
        prefix: 'action',
        ttl: 2592000, // Keep in cache for one month
        redis: CONFIG.REDIS_CACHE_URL
      }
    }
  : undefined;

/** @type {import('moleculer').BrokerOptions} */
module.exports = {
  nodeID: 'pod-provider',
  // You can set all ServiceBroker configurations here
  // See https://moleculer.services/docs/0.14/configuration.html
  middlewares: [
    CacherMiddleware(cacherConfig), // Set the cacher before the WebAcl middleware
    WebAclMiddleware({ baseUrl: CONFIG.BASE_URL, podProvider: true }),
    ObjectsWatcherMiddleware({ baseUrl: CONFIG.BASE_URL, podProvider: true, postWithoutRecipients: true }),
    AppControlMiddleware({ baseUrl: CONFIG.BASE_URL })
  ],
  errorHandler,
  logger: {
    type: 'Console',
    options: {
      formatter: 'short',
      level: 'info'
    }
  },
  transporter: CONFIG.REDIS_TRANSPORTER_URL || undefined
};
