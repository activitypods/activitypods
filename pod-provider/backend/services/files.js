const urlJoin = require('url-join');
const { ControlledContainerMixin, MimeTypesMixin } = require('@semapps/ldp');
const CONFIG = require('../config/config');

module.exports = {
  name: 'files',
  mixins: [ControlledContainerMixin, MimeTypesMixin],
  settings: {
    acceptedTypes: ['semapps:File'],
    shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/File'),
    excludeFromMirror: true,
    // TODO load all images with tokens so files can be hidden by default
    // https://javascript.plainenglish.io/loading-images-with-authorization-8aab33663ba6
    newResourcesPermissions: { anon: { read: true } },
    typeIndex: 'public',
    // MimeTypesMixin settings
    mimeTypes: {
      accepted: ['image/*']
    }
  }
};
