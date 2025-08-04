import { StorageService } from '@semapps/solid';
import CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  mixins: [StorageService],
  settings: {
    baseUrl: CONFIG.BASE_URL
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
