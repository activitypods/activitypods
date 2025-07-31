import path from 'path';
import { JsonLdService } from '@semapps/jsonld';
import CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const ServiceSchema = {
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
} satisfies ServiceSchema;

export default ServiceSchema;
