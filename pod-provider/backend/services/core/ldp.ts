import { LdpService, DocumentTaggerMixin } from '@semapps/ldp';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "ldp"; settings: { baseUrl: null; co... Remove this comment to see the full error message
  mixins: [LdpService, DocumentTaggerMixin],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    podProvider: true,
    resourcesWithContainerPath: process.env.NODE_ENV === 'test', // In tests, keep the path to make it easier to know what URIs are referring to
    defaultContainerOptions: {
      permissions: {},
      newResourcesPermissions: {}
    }
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
