// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { WebfingerService } from '@semapps/webfinger';
// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../../config/config.ts';

export default {
  mixins: [WebfingerService],
  settings: {
    baseUrl: CONFIG.BASE_URL
  }
};
