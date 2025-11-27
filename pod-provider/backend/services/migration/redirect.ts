import { RedirectService } from '@semapps/migration';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "triplestore"; settings: { baseUrl: nu... Remove this comment to see the full error message
  mixins: [RedirectService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    redisUrl: CONFIG.REDIS_REDIRECT_URL
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
