const { ControlledContainerMixin } = require('@semapps/ldp');
module.exports = {
  name: 'openbadges.baked-badge',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/baked-badges',
    acceptedTypes: ['semapps:File'],
    newResourcesPermissions: { anon: { read: true } },
  }
};
