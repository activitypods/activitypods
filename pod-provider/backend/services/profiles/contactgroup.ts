import urlJoin from 'url-join';
import { ControlledContainerMixin } from '@semapps/ldp';
import CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const ProfilesContactgroupSchema = {
  name: 'profiles.contactgroup' as const,
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
