const { WebAclMiddleware, CacherMiddleware } = require('@semapps/webacl');
const { ObjectsWatcherMiddleware } = require('@semapps/activitypub');
const CONFIG = require('./config/config');
const errorHandler = require('./config/errorHandler');

// Use the cacher only if Redis is configured
const cacherConfig = CONFIG.REDIS_CACHE_URL
  ? {
      type: 'Redis',
      options: {
        prefix: 'action',
        ttl: 2592000, // Keep in cache for one month
        redis: CONFIG.REDIS_CACHE_URL,
      },
    }
  : undefined;

Error.stackTraceLimit = Infinity;

module.exports = {
  // You can set all ServiceBroker configurations here
  // See https://moleculer.services/docs/0.14/configuration.html
  middlewares: [
    CacherMiddleware(cacherConfig), // Set the cacher before the WebAcl middleware
    WebAclMiddleware({ baseUrl: CONFIG.HOME_URL, podProvider: true }),
    ObjectsWatcherMiddleware({ podProvider: true })
  ],
  errorHandler,
  logger: {
    type: 'Console',
    options: {
      formatter: 'short',
      level: 'info',
    },
  },
};
