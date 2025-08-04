import path from 'path';
import { JsonLdService } from '@semapps/jsonld';
import CONFIG from '../../config/config.ts';

const Schema = {
  mixins: [JsonLdService],
  settings: {
    baseUri: CONFIG.BASE_URL,
    cachedContextFiles: [
      {
        uri: 'https://www.w3.org/ns/activitystreams',
        file: path.resolve(__dirname, '../../config/context-as.json')
      }
    ]
  }
};

export default Schema;
