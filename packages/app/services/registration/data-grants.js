const { ControlledContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'data-grants',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:DataGrant'],
    newResourcesPermissions: {}
  }
};
