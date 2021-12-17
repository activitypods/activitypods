const { ControlledContainerMixin } = require('@semapps/ldp');
const { OBJECT_TYPES } = require('@semapps/activitypub');

module.exports = {
  name: 'events.event',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/events',
    acceptedTypes: [OBJECT_TYPES.EVENT],
    permissions: {},
    newResourcesPermissions: {}
  },
  dependencies: ['synchronizer'],
  async started() {
    await this.broker.call('synchronizer.watch', { type: OBJECT_TYPES.EVENT });
  },
  hooks: {
    after: {
      async post(ctx, res) {
        await ctx.call('events.status.tagNewEvent', { eventUri: res });
        return res;
      }
    }
  }
};
