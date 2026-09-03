import { StorageService } from '@semapps/solid';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "solid-storage"; settings: { baseUrl... Remove this comment to see the full error message
  mixins: [StorageService],
  settings: {
    baseUrl: CONFIG.BASE_URL
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
