const { ACTIVITY_TYPES, ACTOR_TYPES, ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { CONTACT_REQUEST, ACCEPT_CONTACT_REQUEST, REJECT_CONTACT_REQUEST, IGNORE_CONTACT_REQUEST} = require("../patterns");

module.exports = {
  name: 'contacts.request',
  mixins: [ActivitiesHandlerMixin],
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
  activities: {
    contactRequest: {
      match: CONTACT_REQUEST,
      async onEmit(ctx, activity, emitterUri) {
        // Give read right for my profile
        await ctx.call('webacl.resource.addRights', {
          resourceUri: activity.object.object.id,
          additionalRights: {
            user: {
              uri: activity.target,
              read: true
            }
          },
          webId: emitterUri
        });
      },
      async onReceive(ctx, activity, recipients) {
        for (let recipientUri of recipients) {
          const recipient = await ctx.call('activitypub.actor.get', {actorUri: recipientUri});

          // If the request was already rejected, reject it again
          if (await ctx.call('activitypub.collection.includes', {
            collectionUri: recipient['apods:rejectedContacts'],
            item: activity.actor
          })) {
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
          const collection = await ctx.call('activitypub.collection.get', {
            collectionUri: recipient['apods:contactRequests'],
            webId: recipientUri
          });
          if (collection
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
      }
    },
    acceptContactRequest: {
      match: ACCEPT_CONTACT_REQUEST,
      async onEmit(ctx, activity, emitterUri) {
        const emitter = await ctx.call('activitypub.actor.get', {actorUri: emitterUri});

        // Give read right of my profile
        await ctx.call('webacl.resource.addRights', {
          resourceUri: emitter.url,
          additionalRights: {
            user: {
              uri: activity.to,
              read: true
            }
          },
          webId: emitterUri
        });

        // 2. Cache the other actor's profile
        await ctx.call('activitypub.object.cacheRemote', {
          objectUri: activity.object.object.object,
          actorUri: activity.actor
        });

        // 3. Add the other actor to my contacts list
        await ctx.call('activitypub.collection.attach', {
          collectionUri: emitter['apods:contacts'],
          item: activity.object.actor
        });

        // 4. Remove the activity from my contact requests
        await ctx.call('activitypub.collection.detach', {
          collectionUri: emitter['apods:contactRequests'],
          item: activity.object.id
        });
      },
      async onReceive(ctx, activity, recipients) {
        for (let recipientUri of recipients) {
          const emitter = await ctx.call('activitypub.actor.get', {actorUri: activity.actor});
          const recipient = await ctx.call('activitypub.actor.get', {actorUri: recipientUri});

          // Cache the other actor's profile (it should be visible now)
          await ctx.call('activitypub.object.cacheRemote', {
            objectUri: emitter.url,
            actorUri: activity.to
          });

          // Add the other actor to my contacts list
          await ctx.call('activitypub.collection.attach', {
            collectionUri: recipient['apods:contacts'],
            item: emitter.id
          });

          // TODO Send a notification
        }
      }
    },
    ignoreContactRequest: {
      match: IGNORE_CONTACT_REQUEST,
      async onEmit(ctx, activity, emitterUri) {
        const emitter = await ctx.call('activitypub.actor.get', { actorUri: emitterUri });

        // Remove the activity from my contact requests
        await ctx.call('activitypub.collection.detach', {
          collectionUri: emitter['apods:contactRequests'],
          item: activity.object.id
        });
      }
    },
    rejectContactRequest: {
      match: REJECT_CONTACT_REQUEST,
      async onEmit(ctx, activity, emitterUri) {
        const emitter = await ctx.call('activitypub.actor.get', {actorUri: emitterUri});

        // Add the actor to my rejected contacts list
        await ctx.call('activitypub.collection.attach', {
          collectionUri: emitter['apods:rejectedContacts'],
          item: activity.object.actor
        });

        // Remove the activity from my contact requests
        await ctx.call('activitypub.collection.detach', {
          collectionUri: emitter['apods:contactRequests'],
          item: activity.object.id
        });
      }
    }
  }
};
