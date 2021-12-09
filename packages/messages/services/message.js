const { ControlledContainerMixin } = require('@semapps/ldp');
const { OBJECT_TYPES, ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { CREATE_NOTE } = require("../patterns");

module.exports = {
  name: 'messages.message',
  mixins: [ControlledContainerMixin, ActivitiesHandlerMixin],
  settings: {
    path: '/notes',
    acceptedTypes: [OBJECT_TYPES.NOTE],
    permissions: {},
    newResourcesPermissions: {}
  },
  dependencies: ['notification'],
  activities: {
    createNote: {
      match: CREATE_NOTE,
      async onReceive(ctx, activity, recipients) {
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
