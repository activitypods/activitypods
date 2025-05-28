const { LdpService, DocumentTaggerMixin } = require('@semapps/ldp');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [LdpService, DocumentTaggerMixin],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    podProvider: true,
    resourcesWithContainerPath: process.env.NODE_ENV !== 'test', // In tests, keep the path to make it easier to know what URIs are refering to
    defaultContainerOptions: {
      permissions: {},
      newResourcesPermissions: {}
    }
  }
};
