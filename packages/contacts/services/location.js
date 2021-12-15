const { ControlledContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'contacts.location',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/locations',
    acceptedTypes: ['vcard:Location'],
    dereference: ['vcard:hasAddress/vcard:hasGeo'],
    permissions: {},
    newResourcesPermissions: {}
  }
};
