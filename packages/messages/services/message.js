const { ControlledContainerMixin, defaultToArray } = require('@semapps/ldp');
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
    async getContextName(ctx, activity, recipientUri) {
      let contextName
      if( activity.object.context ) {
        try {
          const contextObject = await ctx.call('activitypub.object.get', { objectUri: activity.object.context, actorUri: recipientUri });
          contextName = contextObject.name;
        } catch(e) {
          // If context not found, ignore it...
        }
      }
      return contextName;
    },
    async notifyNewMessage(ctx, activity, recipientUri) {
      const senderProfile = await ctx.call('activitypub.actor.getProfile', {
        actorUri: activity.actor,
        webId: 'system',
      });
      const contextName = await this.getContextName(ctx, activity, recipientUri);
      const key = contextName ? 'new_message_with_context' : 'new_message';
      await ctx.call('notification.notifyUser', {
        recipientUri,
        key,
        payload: {
          title: key + '.title',
          body: activity.object.content,
          actions: [
            {
              name: key + '.actions.answer',
              link: '/Profile/' + encodeURIComponent(senderProfile.id) + '/show',
            },
          ],
        },
        vars: {
          name: senderProfile['vcard:given-name'],
          contextName
        },
      });
    },
  },
  activities: {
    createNote: {
      match: CREATE_NOTE,
      async onEmit(ctx, activity, emitterUri) {
        // Ensure the recipients are in the contacts WebACL group of the emitter so they can see his profile (and respond him)
        for (let targetUri of defaultToArray(activity.to)) {
          await ctx.call('webacl.group.addMember', {
            groupSlug: new URL(emitterUri).pathname + '/contacts',
            memberUri: targetUri,
            webId: emitterUri,
          });
        }
      },
      async onReceive(ctx, activity, recipients) {
        for (let recipientUri of recipients) {
          await this.notifyNewMessage(ctx, activity, recipientUri);
        }
      },
    },
  },
};
