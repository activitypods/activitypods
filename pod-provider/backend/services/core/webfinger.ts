import { WebfingerService } from '@semapps/webfinger';
import CONFIG from '../../config/config.ts';

const Schema = {
  mixins: [WebfingerService],
  settings: {
    baseUrl: CONFIG.BASE_URL
  }
};

export default Schema;
