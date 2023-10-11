const { ControlledContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'app-registrations',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/app-registrations',
    acceptedTypes: ['interop:ApplicationRegistration'],
    newResourcesPermissions: {}
  }
};
