import { WebAclService } from '@semapps/webacl';
import CONFIG from '../../config/config.ts';

const Schema = {
  mixins: [WebAclService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    podProvider: true
  }
};

export default Schema;
