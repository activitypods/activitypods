const { ControlledContainerMixin } = require('@semapps/ldp');
const { OBJECT_TYPES } = require('@semapps/activitypub');

module.exports = {
  name: 'events.event',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/events',
    acceptedTypes: [OBJECT_TYPES.EVENT],
    permissions: {},
    newResourcesPermissions: {},
  },
  dependencies: ['synchronizer'],
  async started() {
    await this.broker.call('synchronizer.watch', { type: OBJECT_TYPES.EVENT });
  },
  hooks: {
    after: {
      async create(ctx, res) {
        await ctx.call('events.status.tagNewEvent', { eventUri: res.resourceUri });
        await ctx.call('events.invitation.giveRightsForNewEvent', { resourceUri: res.resourceUri });
        return res;
      },
      async patch(ctx, res) {
        await ctx.call('events.invitation.giveRightsForUpdatedEvent', res);
        if (res.newData['apods:maxAttendees'] !== res.oldData['apods:maxAttendees']) {
          await ctx.call('events.status.tagUpdatedEvent', { eventUri: res.resourceUri });
        }
        return res;
      },
      async put(ctx, res) {
        await ctx.call('events.invitation.giveRightsForUpdatedEvent', res);
        if (res.newData['apods:maxAttendees'] !== res.oldData['apods:maxAttendees']) {
          await ctx.call('events.status.tagUpdatedEvent', { eventUri: res.resourceUri });
        }
        return res;
      },
    },
  },
};
