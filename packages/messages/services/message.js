const { ControlledContainerMixin } = require('@semapps/ldp');
const { OBJECT_TYPES, ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { CREATE_NOTE } = require('../patterns');

module.exports = {
  name: 'messages.message',
  mixins: [ControlledContainerMixin, ActivitiesHandlerMixin],
  settings: {
    path: '/notes',
    acceptedTypes: [OBJECT_TYPES.NOTE],
    permissions: {},
    newResourcesPermissions: {},
  },
  dependencies: ['notification'],
  methods: {
    async notifyNewMessage(ctx, activity, recipientUri) {
      const senderProfile = await ctx.call('activitypub.actor.getProfile', {
        actorUri: activity.actor,
        webId: 'system',
      });
      await ctx.call('notification.notifyUser', {
        recipientUri,
        key: 'new_message',
        payload: {
          title: 'new_message.title',
          body: activity.object.content,
          actions: [
            {
              name: 'new_message.actions.answer',
              link: '/Profile/' + encodeURIComponent(senderProfile.id) + '/show',
            },
          ],
        },
        vars: {
          name: senderProfile['vcard:given-name'],
        },
      });
    },
  },
  activities: {
    createNote: {
      match: CREATE_NOTE,
      async onReceive(ctx, activity, recipients) {
        for (let recipientUri of recipients) {
          await this.notifyNewMessage(ctx, activity, recipientUri);
        }
      },
    },
  },
};
