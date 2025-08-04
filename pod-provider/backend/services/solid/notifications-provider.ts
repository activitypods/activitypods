import { NotificationsProviderService } from '@semapps/solid';
import CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  mixins: [NotificationsProviderService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    settingsDataset: CONFIG.AUTH_ACCOUNTS_DATASET,
    queueServiceUrl: CONFIG.QUEUE_SERVICE_URL
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
