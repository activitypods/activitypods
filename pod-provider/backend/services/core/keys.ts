import path from 'path';
import { KeysService } from '@semapps/crypto';
import { ServiceSchema } from 'moleculer';

const ServiceSchema = {
  mixins: [KeysService],

  settings: {
    podProvider: true
  }
} satisfies ServiceSchema;

export default ServiceSchema;
