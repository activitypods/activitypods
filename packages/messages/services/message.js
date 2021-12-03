const { ControlledContainerMixin } = require('@semapps/ldp');
const { ACTIVITY_TYPES, OBJECT_TYPES } = require('@semapps/activitypub');

module.exports = {
  name: 'messages.message',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/notes',
    acceptedTypes: [OBJECT_TYPES.NOTE],
    permissions: {},
    newResourcesPermissions: {}
  },
  dependencies: ['notification'],
  events: {
    async 'activitypub.inbox.received'(ctx) {
      const { activity, recipients } = ctx.params;
      if( activity.type === ACTIVITY_TYPES.CREATE && activity.object.type === OBJECT_TYPES.NOTE ) {
        for( let recipientUri of recipients ) {
          await ctx.call('notification.newMessage', {
            content: activity.object.content,
            senderUri: activity.actor,
            recipientUri
          });
        }
      }
    }
  }
};
