import urlJoin from 'url-join';
import { ControlledContainerMixin } from '@semapps/ldp';
import CONFIG from '../../config/config.ts';

const ProfilesContactgroupSchema = {
  name: 'profiles.contactgroup',
  mixins: [ControlledContainerMixin],
  settings: {
    // ControlledContainerMixin settings
    acceptedTypes: ['vcard:Group'],
    shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/vcard/Group'),
    permissions: {},
    newResourcesPermissions: {},
    typeIndex: 'public'
  }
};

export default ProfilesContactgroupSchema;
