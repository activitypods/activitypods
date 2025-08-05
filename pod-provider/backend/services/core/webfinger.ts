import { WebfingerService } from '@semapps/webfinger';
import CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  mixins: [WebfingerService],

  settings: {
    baseUrl: CONFIG.BASE_URL
  }
} satisfies ServiceSchema;

export default Schema;
