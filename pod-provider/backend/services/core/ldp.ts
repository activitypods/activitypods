import { LdpService, DocumentTaggerMixin } from '@semapps/ldp';
import CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  mixins: [LdpService, DocumentTaggerMixin],

  settings: {
    baseUrl: CONFIG.BASE_URL,
    podProvider: true,
    resourcesWithContainerPath: false,
    defaultContainerOptions: {
      permissions: {},
      newResourcesPermissions: {}
    }
  }
} satisfies ServiceSchema;

export default Schema;
