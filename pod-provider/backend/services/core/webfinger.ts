import { WebfingerService } from '@semapps/webfinger';
import CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const ServiceSchema = {
  mixins: [WebfingerService],

  settings: {
    baseUrl: CONFIG.BASE_URL
  }
} satisfies ServiceSchema;

export default ServiceSchema;
