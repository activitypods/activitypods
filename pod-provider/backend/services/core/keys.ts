import path from 'path';
import { KeysService } from '@semapps/crypto';
import { ServiceSchema } from 'moleculer';

const Schema = {
  mixins: [KeysService],
  settings: {
    podProvider: true
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
