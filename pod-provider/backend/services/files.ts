import urlJoin from 'url-join';
import { ControlledContainerMixin, MimeTypesMixin } from '@semapps/ldp';
import * as CONFIG from '../config/config.ts';
import { ServiceSchema } from 'moleculer';

const FilesSchema = {
  name: 'files' as const,
  // @ts-expect-error TS(2322): Type '{ settings: { path: null; acceptedTypes: nul... Remove this comment to see the full error message
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
} satisfies ServiceSchema;

export default FilesSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [FilesSchema.name]: typeof FilesSchema;
    }
  }
}
