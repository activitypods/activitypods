import { ProxyService } from '@semapps/crypto';
import { ServiceSchema } from 'moleculer';

const Schema = {
  mixins: [ProxyService],

  settings: {
    podProvider: true
  }
} satisfies ServiceSchema;

export default Schema;
