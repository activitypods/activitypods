const { ControlledContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'profiles.contactgroup',
  mixins: [ControlledContainerMixin],
  settings: {
    // ControlledContainerMixin settings
    path: '/groups',
    acceptedTypes: ['vcard:Group'],
    // Should this?
    dereference: ['vcard:hasMember'],
    permissions: {},
    newResourcesPermissions: {},
  },
  // Do I need to declare those?
  dependencies: ['activitypub'],
  events: {},
  hooks: {
    before: {},
  },
};
