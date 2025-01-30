const urlJoin = require('url-join');
const { ControlledContainerMixin } = require('@semapps/ldp');
const CONFIG = require('../../config/config');

module.exports = {
  name: 'profiles.contactgroup',
  mixins: [ControlledContainerMixin],
  settings: {
    // ControlledContainerMixin settings
    shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL, '/vcard/Group'),
    permissions: {},
    newResourcesPermissions: {}
  }
};
