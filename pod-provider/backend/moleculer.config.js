const { WebAclMiddleware, CacherMiddleware } = require('@semapps/webacl');
const { ObjectsWatcherMiddleware } = require('@semapps/sync');
const AppControlMiddleware = require('./middlewares/app-control');
const CONFIG = require('./config/config');
const errorHandler = require('./config/errorHandler');
const RdfJSONSerializer = require('./RdfJSONSerializer');

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

// Temporary solution for https://github.com/assemblee-virtuelle/semapps/issues/1424
const SkipOrphanBlankNodesCleanupMiddleware = () => ({
  name: 'SkipOrphanBlankNodesCleanupMiddleware',
  localAction: (next, action) => {
    if (action.name === 'triplestore.deleteOrphanBlankNodes') {
      return async ctx => {};
    } else {
      return next;
    }
  }
});

/** @type {import('moleculer').BrokerOptions} */
module.exports = {
  nodeID: 'pod-provider',
  // You can set all ServiceBroker configurations here
  // See https://moleculer.services/docs/0.14/configuration.html
  middlewares: [
    SkipOrphanBlankNodesCleanupMiddleware(),
    CacherMiddleware(cacherConfig), // Set the cacher before the WebAcl middleware
    WebAclMiddleware({ baseUrl: CONFIG.BASE_URL, podProvider: true }),
    ObjectsWatcherMiddleware({ baseUrl: CONFIG.BASE_URL, podProvider: true, postWithoutRecipients: true }),
    AppControlMiddleware({ baseUrl: CONFIG.BASE_URL })
  ],
  errorHandler,
  logger: [
    {
      type: 'Console',
      options: {
        formatter: 'short',
        level: 'info'
      }
    },
    {
      type: 'File',
      options: {
        formatter: 'short',
        level: 'error',
        folder: './logs',
        filename: 'moleculer-errors-{date}.log'
      }
    }
  ],
  transporter: CONFIG.REDIS_TRANSPORTER_URL || undefined,
  serializer: CONFIG.REDIS_TRANSPORTER_URL ? new RdfJSONSerializer() : undefined
};
