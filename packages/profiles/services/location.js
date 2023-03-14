const { ControlledContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'profiles.location',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/locations',
    acceptedTypes: ['vcard:Location'],
    dereference: ['vcard:hasAddress/vcard:hasGeo'],
    excludeFromMirror: true,
    permissions: {},
    newResourcesPermissions: {},
  },
};
