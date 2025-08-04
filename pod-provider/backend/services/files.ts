import urlJoin from 'url-join';
import { ControlledContainerMixin, MimeTypesMixin } from '@semapps/ldp';
import CONFIG from '../config/config.ts';

const FilesSchema = {
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

export default FilesSchema;
