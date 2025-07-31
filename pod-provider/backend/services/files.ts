// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { ControlledContainerMixin, MimeTypesMixin } from '@semapps/ldp';
// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../config/config.ts';
import { ServiceSchema } from 'moleculer';

const FilesServiceSchema = {
  name: 'files' as const,
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

export default FilesServiceSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [FilesServiceSchema.name]: typeof FilesServiceSchema;
    }
  }
}
