// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { EndpointService } from '@semapps/solid';
// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const ServiceSchema = {
  mixins: [EndpointService],

  settings: {
    baseUrl: CONFIG.BASE_URL,
    settingsDataset: CONFIG.AUTH_ACCOUNTS_DATASET
  }
} satisfies ServiceSchema;

export default ServiceSchema;
