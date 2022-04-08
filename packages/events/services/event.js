const { ControlledContainerMixin } = require('@semapps/ldp');
const { AnnouncerMixin } = require('@activitypods/announcer');
const { SynchronizerMixin } = require('@activitypods/synchronizer');
const { OBJECT_TYPES } = require('@semapps/activitypub');

module.exports = {
  name: 'events.event',
  mixins: [SynchronizerMixin, AnnouncerMixin, ControlledContainerMixin],
  settings: {
    path: '/events',
    acceptedTypes: [OBJECT_TYPES.EVENT],
    permissions: {},
    newResourcesPermissions: {},
  },
  hooks: {
    after: {
      async create(ctx, res) {
        // TODO Ensure awaitCreateComplete is called before these actions
        await ctx.call('events.status.tagNewEvent', { eventUri: res.resourceUri });
        await ctx.call('events.registration.addCreatorToAttendees', res);
        await ctx.call('events.registration.givePermissionsForAttendeesCollection', res);
        await ctx.call('events.location.setNewRights', res);
        return res;
      },
      async patch(ctx, res) {
        await ctx.call('events.location.updateRights', res);
        if (res.newData['apods:maxAttendees'] !== res.oldData['apods:maxAttendees']) {
          await ctx.call('events.status.tagUpdatedEvent', { eventUri: res.resourceUri });
        }
        return res;
      },
      async put(ctx, res) {
        await ctx.call('events.location.updateRights', res);
        if (res.newData['apods:maxAttendees'] !== res.oldData['apods:maxAttendees']) {
          await ctx.call('events.status.tagUpdatedEvent', { eventUri: res.resourceUri });
        }
        return res;
      },
    },
  },
};
