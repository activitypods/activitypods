const { ACTIVITY_TYPES, ACTOR_TYPES, OBJECT_TYPES } = require('@semapps/activitypub');
const { hasType } = require('@semapps/ldp');
const { MIME_TYPES } = require("@semapps/mime-types");

module.exports = {
  name: 'contacts.request',
  dependencies: ['activitypub.registry', 'webacl'],
  async started() {
    await this.broker.call('activitypub.registry.register', {
      path: '/contacts',
      attachToTypes: Object.values(ACTOR_TYPES),
      attachPredicate: 'http://activitypods.org/ns/core#contacts',
      ordered: false,
      dereferenceItems: false,
      permissions: {}
    });

    await this.broker.call('activitypub.registry.register', {
      path: '/contact-requests',
      attachToTypes: Object.values(ACTOR_TYPES),
      attachPredicate: 'http://activitypods.org/ns/core#contactRequests',
      ordered: false,
      dereferenceItems: true,
      permissions: {}
    });

    await this.broker.call('activitypub.registry.register', {
      path: '/rejected-contacts',
      attachToTypes: Object.values(ACTOR_TYPES),
      attachPredicate: 'http://activitypods.org/ns/core#rejectedContacts',
      ordered: false,
      dereferenceItems: false,
      permissions: {}
    });
  },
  events: {
    async 'activitypub.outbox.posted'(ctx) {
      const { activity } = ctx.params;
      if( await this.isRequest(ctx, activity) ) {
        // Give read right for my profile
        await ctx.call('webacl.resource.addRights', {
          resourceUri: activity.object.object,
          additionalRights: {
            user: {
              uri: activity.target,
              read: true
            }
          },
          webId: activity.actor
        });
      } else if( await this.isRequestAccept(ctx, activity) ) {
        const sender = await ctx.call('activitypub.actor.get', { actorUri: activity.actor });
        const acceptedActivity = await ctx.call('activitypub.activity.get', { resourceUri: activity.object, webId: 'system' });

        // 1. Give read right for my profile
        await ctx.call('webacl.resource.addRights', {
          resourceUri: sender.url,
          additionalRights: {
            user: {
              uri: activity.to,
              read: true
            }
          },
          webId: activity.actor
        });

        // 2. Cache the other actor's profile
        await ctx.call('activitypub.object.cacheRemote', {
          objectUri: acceptedActivity.object.object,
          actorUri: activity.actor
        });

        // 3. Add the other actor to my contacts list
        await ctx.call('activitypub.collection.attach', { collectionUri: sender['apods:contacts'], item: acceptedActivity.actor });

        // 4. Remove the activity from my contact requests
        await ctx.call('activitypub.collection.detach', { collectionUri: sender['apods:contactRequests'], item: activity.object });
      } else if( await this.isRequestReject(ctx, activity) ) {
        const rejectedActivity = await ctx.call('activitypub.activity.get', { resourceUri: activity.object, webId: 'system' });
        const actor = await ctx.call('activitypub.actor.get', { actorUri: activity.actor });

        // Add the actor to my rejected contacts list
        await ctx.call('activitypub.collection.attach', { collectionUri: actor['apods:rejectedContacts'], item: rejectedActivity.actor });

        // Remove the activity from my contact requests
        await ctx.call('activitypub.collection.detach', { collectionUri: actor['apods:contactRequests'], item: rejectedActivity });
      }
    },
    async 'activitypub.inbox.received'(ctx) {
      const { activity, recipients } = ctx.params;
      if( await this.isRequest(ctx, activity) ) {
        for( let recipientUri of recipients ) {
          const recipient = await ctx.call('activitypub.actor.get', { actorUri: recipientUri });

          // If the request was already rejected, reject it again
          if (await ctx.call('activitypub.collection.includes', { collectionUri: recipient['apods:rejectedContacts'], item: activity.actor })) {
            await ctx.call('activitypub.outbox.post', {
              collectionUri: recipient.outbox,
              type: ACTIVITY_TYPES.REJECT,
              actor: recipient.id,
              object: activity.id,
              to: activity.actor
            });
            continue;
          }

          // Check that a request by the same actor is not already waiting (if so, ignore it)
          const collection = await ctx.call('activitypub.collection.get', { collectionUri: recipient['apods:contactRequests'], webId: recipientUri });
          if( collection
            && collection.items.length > 0
            && collection.items.find(a => a.actor === activity.actor)
          ) {
            continue;
          }

          await ctx.call('activitypub.collection.attach', {
            collectionUri: recipient['apods:contactRequests'],
            item: activity
          });

          await ctx.call('notification.contactOffer', {
            message: activity.content,
            senderUri: activity.actor,
            recipientUri
          });
        }
      } else if( await this.isRequestAccept(ctx, activity) ) {
        for( let recipientUri of recipients ) {
          const sender = await ctx.call('activitypub.actor.get', { actorUri: activity.actor });
          const recipient = await ctx.call('activitypub.actor.get', { actorUri: recipientUri });

          // Cache the other actor's profile (it should be visible now)
          await ctx.call('activitypub.object.cacheRemote', {
            objectUri: sender.url,
            actorUri: activity.to
          });

          // Add the other actor to my contacts list
          await ctx.call('activitypub.collection.attach', { collectionUri: recipient['apods:contacts'], item: sender.id });

          // TODO Send a notification
        }
      }
    },
    async 'event.status.finished'(ctx) {
      const { eventUri } = ctx.params;
      const event = await ctx.call('event.get', { resourceUri: eventUri, accept: MIME_TYPES.JSON, webId: 'system' });
      const participants = event['pair:involvedIn'];

      for( let participantUri of participants ) {
        const participant = await ctx.call('activitypub.actor.get', { actorUri: participantUri });

        let potentialNewContacts = [];
        for( let otherParticipantUri of participants ) {
          const alreadyConnected = await ctx.call('activitypub.collection.includes', { collectionUri: participant['apods:contacts'], item: otherParticipantUri });
          if( !alreadyConnected ) potentialNewContacts.push(otherParticipantUri);
        }

        if( potentialNewContacts.length > 0 ) {
          await ctx.call('activitypub.outbox.post', {
            collectionUri: participant.outbox,
            type: ACTIVITY_TYPES.OFFER,
            actor: participant.id,
            object: {
              type: ACTIVITY_TYPES.ADD,
              object: participant.url,
            },
            content: "Nous avons participé au même événement: " + event['pair:label'],
            target: potentialNewContacts,
            to: potentialNewContacts
          });
        }
      }
    }
  },
  methods: {
    async isRequest(ctx, activity) {
      if( activity.type === ACTIVITY_TYPES.OFFER && activity.object.type === ACTIVITY_TYPES.ADD ) {
        const object = await ctx.call('activitypub.object.get', { objectUri: activity.object.object, actorUri: activity.actor });
        return hasType(object, OBJECT_TYPES.PROFILE);
      }
      return false;
    },
    async isRequestAccept(ctx, activity) {
      if( activity.type === ACTIVITY_TYPES.ACCEPT ) {
        const acceptedActivity = await ctx.call('activitypub.activity.get', { resourceUri: activity.object, webId: 'system' });
        return this.isRequest(ctx, acceptedActivity);
      }
      return false;
    },
    async isRequestReject(ctx, activity) {
      if( activity.type === ACTIVITY_TYPES.REJECT ) {
        const rejectedActivity = await ctx.call('activitypub.activity.get', { resourceUri: activity.object, webId: 'system' });
        return this.isRequest(ctx, rejectedActivity);
      }
      return false;
    },
    async getContactRequestsUri(ctx, actorUri) {
      const actor = await ctx.call('activitypub.actor.get', { actorUri });
      return actor['apods:contactRequests'];
    }
  }
};
