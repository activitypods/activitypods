// @ts-expect-error TS(6059): File '/home/laurin/projects/virtual-assembly/semap... Remove this comment to see the full error message
import { WebAclMiddleware, CacherMiddleware } from '@semapps/webacl';
// @ts-expect-error TS(6059): File '/home/laurin/projects/virtual-assembly/semap... Remove this comment to see the full error message
import { ObjectsWatcherMiddleware } from '@semapps/sync';
import AppControlMiddleware from './middlewares/app-control.ts';
// @ts-expect-error TS(1192): Module '"/home/laurin/projects/virtual-assembly/ac... Remove this comment to see the full error message
import * as CONFIG from './config/config.ts';
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

/** @type {import('moleculer').BrokerOptions} */
export { errorHandler };

export const nodeID = 'pod-provider';

export const middlewares = [
  CacherMiddleware(cacherConfig), // Set the cacher before the WebAcl middleware
  WebAclMiddleware({ baseUrl: CONFIG.BASE_URL, podProvider: true }),
  ObjectsWatcherMiddleware({ baseUrl: CONFIG.BASE_URL, podProvider: true, postWithoutRecipients: true }),
  AppControlMiddleware({ baseUrl: CONFIG.BASE_URL })
];

export const logger = [
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
];

export const transporter = CONFIG.REDIS_TRANSPORTER_URL || undefined;
export const serializer = CONFIG.REDIS_TRANSPORTER_URL ? new RdfJSONSerializer() : undefined;
