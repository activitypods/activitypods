const urlJoin = require('url-join');
const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');
const { ACTIVITY_TYPES, OBJECT_TYPES, ActivitiesHandlerMixin } = require('@semapps/activitypub');
const CONFIG = require('../../config/config');

module.exports = {
  name: 'contacts.message',
  mixins: [ControlledContainerMixin, ActivitiesHandlerMixin],
  settings: {
    acceptedTypes: ['as:Note'],
    shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Note'),
    permissions: {},
    newResourcesPermissions: {},
    typeIndex: 'public'
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
        // For now, only send notification for direct messages (not sent through followers list, nor CCed)
        // Otherwise we may get dozens of messages from Mastodon actors, which should be read on Mastopod feed
        if (arrayOf(activity.to).includes(recipientUri)) {
          return await ctx.call('mail-notifications.notify', {
            template: {
              title: {
                en: `{{#if activity.object.summary}}{{{activity.object.summary}}}{{else}}{{#if emitterProfile.vcard:given-name}}{{{emitterProfile.vcard:given-name}}}{{else}}{{{emitter.name}}}{{/if}} sent you a message{{/if}}`,
                fr: `{{#if activity.object.summary}}{{{activity.object.summary}}}{{else}}{{#if emitterProfile.vcard:given-name}}{{{emitterProfile.vcard:given-name}}}{{else}}{{{emitter.name}}}{{/if}} vous a envoyé un message{{/if}}`
              },
              content: '{{removeHtmlTags activity.object.content}}',
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
