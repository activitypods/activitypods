const { ControlledContainerMixin } = require('@semapps/ldp');
const { AnnouncerMixin } = require('@activitypods/announcer');
const { SynchronizerMixin } = require('@activitypods/synchronizer');

module.exports = {
  name: 'marketplace.offer',
  mixins: [SynchronizerMixin, AnnouncerMixin, ControlledContainerMixin],
  settings: {
    path: '/projects',
    acceptedTypes: ['pair:Project'],
    dereference: [],
    permissions: {},
    newResourcesPermissions: {}
  }
};
