const urlJoin = require('url-join');
const { ControlledContainerMixin } = require('@semapps/ldp');
const CONFIG = require('../../config/config');

module.exports = {
  name: 'profiles.contactgroup',
  mixins: [ControlledContainerMixin],
  settings: {
    // ControlledContainerMixin settings
    acceptedTypes: ['vcard:Group'],
    shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'trees/vcard/Group'),
    permissions: {},
    newResourcesPermissions: {},
    typeIndex: 'public'
  }
};
