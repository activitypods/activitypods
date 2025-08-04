import { NotificationsProviderService } from '@semapps/solid';
import CONFIG from '../../config/config.ts';

const Schema = {
  mixins: [NotificationsProviderService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    settingsDataset: CONFIG.AUTH_ACCOUNTS_DATASET,
    queueServiceUrl: CONFIG.QUEUE_SERVICE_URL
  }
};

export default Schema;
