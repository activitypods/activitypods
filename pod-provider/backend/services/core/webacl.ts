import { WebAclService } from '@semapps/webacl';
import CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  mixins: [WebAclService],

  settings: {
    baseUrl: CONFIG.BASE_URL,
    podProvider: true
  }
} satisfies ServiceSchema;

export default ServiceSchema;
