const { ControlledContainerMixin } = require('@semapps/ldp');

/**
 * Mirror container for access grants which have been granted to the app
 */
module.exports = {
  name: 'access-grants',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:AccessGrant'],
    newResourcesPermissions: {}
  }
};
