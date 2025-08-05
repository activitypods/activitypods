import { EndpointService } from '@semapps/solid';
import CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  mixins: [EndpointService],

  settings: {
    baseUrl: CONFIG.BASE_URL,
    settingsDataset: CONFIG.AUTH_ACCOUNTS_DATASET
  }
} satisfies ServiceSchema;

export default ServiceSchema;
