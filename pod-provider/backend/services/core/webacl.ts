import { WebAclService } from '@semapps/webacl';
// @ts-expect-error TS(1192): Module '"/home/laurin/projects/virtual-assembly/ac... Remove this comment to see the full error message
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "webacl"; settings: { baseUrl: null;... Remove this comment to see the full error message
  mixins: [WebAclService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    podProvider: true
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
