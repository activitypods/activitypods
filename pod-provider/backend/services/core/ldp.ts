import { LdpService, DocumentTaggerMixin } from '@semapps/ldp';
import CONFIG from '../../config/config.ts';

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
};

export default Schema;
