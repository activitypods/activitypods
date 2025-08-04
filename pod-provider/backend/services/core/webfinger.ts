// @ts-expect-error TS(6059): File '/home/laurin/projects/virtual-assembly/semap... Remove this comment to see the full error message
import { WebfingerService } from '@semapps/webfinger';
// @ts-expect-error TS(1192): Module '"/home/laurin/projects/virtual-assembly/ac... Remove this comment to see the full error message
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
