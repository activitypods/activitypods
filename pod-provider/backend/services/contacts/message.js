const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');
const { ACTIVITY_TYPES, OBJECT_TYPES, ActivitiesHandlerMixin } = require('@semapps/activitypub');

module.exports = {
  name: 'contacts.message',
  mixins: [ControlledContainerMixin, ActivitiesHandlerMixin],
  settings: {
    acceptedTypes: 'as:Note',
    permissions: {},
    newResourcesPermissions: {},
    description: {
      labelMap: {
        en: 'Messages',
        fr: 'Messages'
      }
    }
  },
  activities: {
    createNote: {
      match: {
        type: ACTIVITY_TYPES.CREATE,
        object: {
          type: OBJECT_TYPES.NOTE
        }
      },
      async onEmit(ctx, activity, emitterUri) {
        // Ensure the recipients are in the contacts WebACL group of the emitter so they can see his profile (and respond him)
        for (let targetUri of arrayOf(activity.to)) {
          await ctx.call('webacl.group.addMember', {
            groupSlug: new URL(emitterUri).pathname + '/contacts',
            memberUri: targetUri,
            webId: emitterUri
          });
        }
      },
      async onReceive(ctx, activity, recipientUri) {
        // For now, only send notification for direct messages (only one recipient, not sent through followers list)
        // Otherwise we may get dozens of messages from Mastodon actors, which should be read on Mastopod feed
        if (activity.to === recipientUri && !activity.cc && !activity.bto && !activity.bcc) {
          return await ctx.call('mail-notifications.notify', {
            template: {
              title: {
                en: `{{#if activity.object.summary}}{{{activity.object.summary}}}{{else}}{{{emitterProfile.vcard:given-name}}} sent you a message{{/if}}`,
                fr: `{{#if activity.object.summary}}{{{activity.object.summary}}}{{else}}{{{emitterProfile.vcard:given-name}}} vous a envoyé un message{{/if}}`
              },
              content: '{{activity.object.content}}',
              actions: [
                {
                  caption: {
                    en: 'Reply',
                    fr: 'Répondre'
                  },
                  link: '/network/{{encodeUri emitter.id}}'
                }
              ]
            },
            recipientUri,
            activity,
            context: activity.object.id
          });
        }
      }
    }
  }
};
