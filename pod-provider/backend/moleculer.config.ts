import { WebAclMiddleware, CacherMiddleware } from '@semapps/webacl';
import { ObjectsWatcherMiddleware } from '@semapps/sync';
import AppControlMiddleware from './middlewares/app-control.ts';
import CONFIG from './config/config.ts';
import errorHandler from './config/errorHandler.ts';
import RdfJSONSerializer from './RdfJSONSerializer.ts';

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

export default {
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
