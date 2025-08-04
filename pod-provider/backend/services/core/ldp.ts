import { LdpService, DocumentTaggerMixin } from '@semapps/ldp';
import CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
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
