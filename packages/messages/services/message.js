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
      const senderProfile = await ctx.call('activitypub.actor.getProfile', { actorUri: activity.actor, webId: 'system' });
      await ctx.call('notification.notifyUser', {
        to: recipientUri,
        key: 'new-message',
        payload: {
          title: `${senderProfile['vcard:given-name']} vous a envoyé un message`,
          body: activity.object.content,
          actions: [{
            name: 'Répondre',
            link: '/Profile/' + encodeURIComponent(senderProfile.id) + '/show',
          }]
        },
      });
    }
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
