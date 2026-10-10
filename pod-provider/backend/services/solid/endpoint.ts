import { EndpointService } from '@semapps/solid';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "solid-endpoint"; mixins: { settings... Remove this comment to see the full error message
  mixins: [EndpointService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    settingsDataset: CONFIG.AUTH_ACCOUNTS_DATASET
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
