import path from 'path';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { JsonLdService } from '@semapps/jsonld';
// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../../config/config.ts';

export default {
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
