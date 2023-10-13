const { ControlledContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'access-grants',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/access-grants',
    acceptedTypes: ['interop:AccessGrant'],
    newResourcesPermissions: {
      anon: {
        read: true
      }
    },
    excludeFromMirror: true
  }
};
