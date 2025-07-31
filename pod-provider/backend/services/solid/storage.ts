// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { StorageService } from '@semapps/solid';
// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const ServiceSchema = {
  mixins: [StorageService],

  settings: {
    baseUrl: CONFIG.BASE_URL
  }
} satisfies ServiceSchema;

export default ServiceSchema;
