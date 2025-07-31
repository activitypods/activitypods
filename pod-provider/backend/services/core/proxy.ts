import { ProxyService } from '@semapps/crypto';
import { ServiceSchema } from 'moleculer';

const ServiceSchema = {
  mixins: [ProxyService],

  settings: {
    podProvider: true
  }
} satisfies ServiceSchema;

export default ServiceSchema;
