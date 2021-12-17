const CONFIG = require('./config');
const { WebAclMiddleware, CacherMiddleware } = require('@semapps/webacl');

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

module.exports = {
  // You can set all ServiceBroker configurations here
  // See https://moleculer.services/docs/0.14/configuration.html
  middlewares: [
    CacherMiddleware(cacherConfig), // Set the cacher before the WebAcl middleware
    WebAclMiddleware({ podProvider: true }),
  ],
  errorHandler(error, { ctx, event, action }) {
    if (ctx && ctx.call) {
      const { requestID, params } = ctx;
      ctx.call('sentry.sendError', { error, requestID, params, event, action });
    }
    throw error;
  },
  logger: {
    type: 'Console',
    options: {
      formatter: 'short',
      level: 'info',
    },
  },
};
