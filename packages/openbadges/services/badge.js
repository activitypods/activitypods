const { ControlledContainerMixin } = require('@semapps/ldp');
module.exports = {
  name: 'openbadges.badge',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/badges',
    acceptedTypes: ['BadgeClass'],
    dereference: ['obi:criteria'],
    permissions: {},
    newResourcesPermissions: { anon: { read: true } },
  },
  dependencies: ['activitypub.registry'],
  async started() {
    await this.broker.call('activitypub.registry.register', {
      path: '/recipients',
      attachToTypes: ['BadgeClass'],
      attachPredicate: 'https://w3id.org/openbadges#recipient',
      ordered: false,
      dereferenceItems: false,
    });
  }
};
