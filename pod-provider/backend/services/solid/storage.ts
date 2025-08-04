import { StorageService } from '@semapps/solid';
import CONFIG from '../../config/config.ts';

const Schema = {
  mixins: [StorageService],
  settings: {
    baseUrl: CONFIG.BASE_URL
  }
};

export default Schema;
