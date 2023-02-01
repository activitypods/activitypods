const { ControlledContainerMixin } = require('@semapps/ldp');
const { AnnouncerMixin } = require('@activitypods/announcer');
const { SynchronizerMixin } = require('@activitypods/synchronizer');

module.exports = {
  name: 'openbadges.badge',
  mixins: [SynchronizerMixin, AnnouncerMixin, ControlledContainerMixin],
  settings: {
    path: '/badges',
    acceptedTypes: [
      'obi:BadgeClass',
    ],
    dereference: [],
    permissions: {},
    newResourcesPermissions: {},
  }
};
