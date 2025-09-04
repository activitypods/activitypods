import { ActivityPubService } from '@semapps/activitypub';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "activitypub"; settings: { baseUri: ... Remove this comment to see the full error message
  mixins: [ActivityPubService],
  settings: {
    baseUri: CONFIG.BASE_URL,
    podProvider: true,
    queueServiceUrl: CONFIG.QUEUE_SERVICE_URL
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
