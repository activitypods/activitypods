// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { ControlledContainerMixin } from '@semapps/ldp';
// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../../config/config.ts';

export default {
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
