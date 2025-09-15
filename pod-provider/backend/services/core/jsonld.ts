import path from 'path';
import { JsonLdService } from '@semapps/jsonld';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "jsonld"; settings: { baseUri: null;... Remove this comment to see the full error message
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
} satisfies Partial<ServiceSchema>;

export default Schema;
