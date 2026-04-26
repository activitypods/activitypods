const { LdpService, DocumentTaggerMixin } = require('@semapps/ldp');
const CONFIG = require('../../config/config');

module.exports = {
  // Don't specify name/dependencies - the mixin provides them
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
};
