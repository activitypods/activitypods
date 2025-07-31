import { LdpService, DocumentTaggerMixin } from '@semapps/ldp';
import CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const ServiceSchema = {
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

export default ServiceSchema;
