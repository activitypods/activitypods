const { ControlledContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'data-grants',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/data-grants',
    acceptedTypes: ['interop:DataGrant'],
    newResourcesPermissions: {}
  }
};
