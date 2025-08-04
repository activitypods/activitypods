import { EndpointService } from '@semapps/solid';
import CONFIG from '../../config/config.ts';

const Schema = {
  mixins: [EndpointService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    settingsDataset: CONFIG.AUTH_ACCOUNTS_DATASET
  }
};

export default Schema;
