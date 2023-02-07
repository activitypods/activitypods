const { ControlledContainerMixin } = require('@semapps/ldp');
module.exports = {
  name: 'openbadges.badge',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/badges',
    acceptedTypes: ['BadgeClass'],
    dereference: [],
    permissions: {},
    newResourcesPermissions: { anon: { read: true } },
  }
};
