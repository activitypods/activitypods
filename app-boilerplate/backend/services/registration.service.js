const { PodActivitiesHandlerMixin } = require('@activitypods/app');

module.exports = {
  name: 'join',
  mixins: [PodActivitiesHandlerMixin],
  activities: {
    join: {
      match: {
        type: 'Join',
        object: {
          type: 'Event'
        }
      },
      async onReceive(ctx, activity, actorUri) {
        const collectionUri = await ctx.call('attendees.getCollectionUriFromResource', {
          resource: activity.object
        });

        await ctx.call('attendees.add', {
          collectionUri,
          itemUri: activity.actor,
          actorUri
        });

        await ctx.call('pod-notifications.send', {
          template: {
            title: {
              en: `{{emitterProfile.vcard:given-name}} is attending your event "{{activity.object.name}}"`,
              fr: `{{emitterProfile.vcard:given-name}} participe à votre rencontre "{{activity.object.name}}"`
            },
            actions: [
              {
                caption: {
                  en: 'View',
                  fr: 'Voir'
                },
                link: '/Event/{{encodeUri activity.object.id}}/show'
              }
            ]
          },
          activity,
          context: activity.object.id,
          recipientUri: actorUri
        });
      }
    },
    leave: {
      match: {
        type: 'Leave',
        object: {
          type: 'Event'
        }
      },
      async onReceive(ctx, activity, actorUri) {
        const collectionUri = await ctx.call('attendees.getCollectionUriFromResource', {
          resource: activity.object
        });

        await ctx.call('attendees.remove', {
          collectionUri,
          itemUri: activity.actor,
          actorUri
        });

        await ctx.call('pod-notifications.send', {
          template: {
            title: {
              en: `{{emitterProfile.vcard:given-name}} is not attending anymore your event "{{activity.object.name}}"`,
              fr: `{{emitterProfile.vcard:given-name}} ne participe plus à votre rencontre "{{activity.object.name}}"`
            },
            actions: [
              {
                caption: {
                  en: 'View',
                  fr: 'Voir'
                },
                link: '/Event/{{encodeUri activity.object.id}}/show'
              }
            ]
          },
          activity,
          context: activity.object.id,
          recipientUri: actorUri
        });
      }
    }
  }
};
