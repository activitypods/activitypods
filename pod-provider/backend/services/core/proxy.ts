import { ProxyService } from '@semapps/crypto';

const Schema = {
  mixins: [ProxyService],
  settings: {
    podProvider: true
  }
};

export default Schema;
