const { ControlledContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'profiles.contactgroup',
  mixins: [ControlledContainerMixin],
  settings: {
    // ControlledContainerMixin settings
    acceptedTypes: ['vcard:Group'],
    permissions: {},
    newResourcesPermissions: {},
    description: {
      labelMap: {
        en: 'Groups',
        fr: 'Groupes'
      },
      labelPredicate: 'vcard:label'
    }
  }
};
