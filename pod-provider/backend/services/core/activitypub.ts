import { ActivityPubService } from '@semapps/activitypub';
import CONFIG from '../../config/config.ts';

const Schema = {
  mixins: [ActivityPubService],
  settings: {
    baseUri: CONFIG.BASE_URL,
    podProvider: true,
    queueServiceUrl: CONFIG.QUEUE_SERVICE_URL
  }
};

export default Schema;
