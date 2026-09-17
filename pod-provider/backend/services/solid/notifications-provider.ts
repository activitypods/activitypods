import { NotificationsProviderService } from '@semapps/solid';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "solid-notifications.provider"; sett... Remove this comment to see the full error message
  mixins: [NotificationsProviderService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    settingsDataset: CONFIG.AUTH_ACCOUNTS_DATASET,
    queueServiceUrl: CONFIG.QUEUE_SERVICE_URL
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
