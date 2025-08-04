// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import { ControlledContainerMixin } from '@semapps/ldp';
// @ts-expect-error TS(1192): Module '"/home/laurin/projects/virtual-assembly/ac... Remove this comment to see the full error message
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const ProfilesContactgroupSchema = {
  name: 'profiles.contactgroup' as const,
  // @ts-expect-error TS(2322): Type '{ settings: { path: null; acceptedTypes: nul... Remove this comment to see the full error message
  mixins: [ControlledContainerMixin],
  settings: {
    // ControlledContainerMixin settings
    acceptedTypes: ['vcard:Group'],
    shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/vcard/Group'),
    permissions: {},
    newResourcesPermissions: {},
    typeIndex: 'public'
  }
} satisfies ServiceSchema;

export default ProfilesContactgroupSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [ProfilesContactgroupSchema.name]: typeof ProfilesContactgroupSchema;
    }
  }
}
