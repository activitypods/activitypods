const { ControlledContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'events.place',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/places',
    acceptedTypes: ['pair:Place'],
    dereference: ['pair:hasPostalAddress'],
    permissions: {},
    newResourcesPermissions: {}
  }
};
