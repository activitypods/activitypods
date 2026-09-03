import { WebfingerService } from '@semapps/webfinger';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "webfinger"; settings: { baseUrl: nu... Remove this comment to see the full error message
  mixins: [WebfingerService],
  settings: {
    baseUrl: CONFIG.BASE_URL
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
