import path from 'path';
import { KeysService } from '@semapps/crypto';

const Schema = {
  mixins: [KeysService],
  settings: {
    podProvider: true
  }
};

export default Schema;
