const { defaultToArray, hasType } = require('@semapps/ldp');
const { ACTIVITY_TYPES, ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { INVITE_EVENT, OFFER_INVITE_EVENT } = require('../patterns');

module.exports = {
  name: 'events.invitation',
  mixins: [ActivitiesHandlerMixin],
  dependencies: ['activitypub.registry', 'ldp', 'notification', 'webacl'],
  async started() {
    await this.broker.call('activitypub.registry.register', {
      path: '/invitees',
      attachToTypes: ['pair:Event'],
      attachPredicate: 'http://activitypods.org/ns/core#invitees',
      ordered: false,
      dereferenceItems: false,
      permissions: {}
    });

    await this.broker.call('activitypub.registry.register', {
      path: '/inviters',
      attachToTypes: ['pair:Event'],
      attachPredicate: 'http://activitypods.org/ns/core#inviters',
      ordered: false,
      dereferenceItems: false,
      permissions: {}
    });
  },
  methods: {
    getInviteesGroupSlug(eventUri) {
      return new URL(eventUri).pathname + '/invitees';
    },
    getInvitersGroupSlug(eventUri) {
      return new URL(eventUri).pathname + '/inviters';
    }
  },
  activities: {
    inviteEvent: {
      match: INVITE_EVENT,
      async onEmit(ctx, activity, emitterUri) {
        const event = activity.object;

        if (emitterUri !== event['apods:organizedBy']) {
          throw new Error('Only the organizer has the right to invite people to the event ' + event.id)
        }

        // Add all invitees to the collection and WebACL group
        for (let inviteeUri of defaultToArray(activity.target)) {
          await ctx.call('activitypub.collection.attach', { collectionUri: event['apods:invitees'], item: inviteeUri });

          await ctx.call('webacl.group.addMember', {
            groupSlug: this.getInviteesGroupSlug(event.id),
            memberUri: inviteeUri,
            webId: event['apods:organizedBy']
          })
        }
      },
      async onReceive(ctx, activity, recipients) {
        for (let recipientUri of recipients) {
          // Cache remote event (we want to be able to fetch it with SPARQL)
          await ctx.call('activitypub.object.cacheRemote', {
            objectUri: activity.object.id,
            actorUri: recipientUri
          });

          // Send notification email
          await ctx.call('notification.invitation', {
            eventUri: activity.object.id,
            senderUri: activity.actor,
            recipientUri
          });
        }
      }
    },
    offerInviteByOrganizer: {
      async match(activity) {
        const dereferencedActivity = await this.matchPattern(OFFER_INVITE_EVENT, activity);
        // If the emitter is the organizer, it means we want to give invitees the right to share this event
        if (dereferencedActivity && dereferencedActivity.actor === dereferencedActivity.object.object['apods:organizedBy']) {
          return dereferencedActivity;
        }
      },
      async onEmit(ctx, activity) {
        const event = activity.object.object;

        // Add all inviters to the collection and WebACL group
        for (let inviterUri of defaultToArray(activity.target)) {
          await ctx.call('activitypub.collection.attach', {collectionUri: event['apods:inviters'], item: inviterUri});

          await ctx.call('webacl.group.addMember', {
            groupSlug: this.getInvitersGroupSlug(event.id),
            memberUri: inviterUri,
            webId: event['apods:organizedBy']
          })
        }
      },
    },
    offerInviteToOrganizer: {
      async match(activity) {
        const dereferencedActivity = await this.matchPattern(OFFER_INVITE_EVENT, activity);
        // If the offer is directed to the organizer, it means we are an inviter and want him to invite one of our contacts
        if (dereferencedActivity && dereferencedActivity.target === dereferencedActivity.object.object['apods:organizedBy']) {
          return dereferencedActivity;
        }
      },
      async onReceive(ctx, activity) {
        const event = activity.object.object;
        const organizer = await ctx.call('activitypub.actor.get', {actorUri: event['apods:organizedBy']});

        const isInviter = await ctx.call('activitypub.collection.includes', {
          collectionUri: event['apods:inviters'],
          itemUri: activity.actor
        });

        if (!isInviter) {
          throw new Error(`Actor ${activity.actor} was not given permission to invite to the event ${event.id}`);
        }

        await ctx.call('activitypub.outbox.post', {
          collectionUri: organizer.outbox,
          type: ACTIVITY_TYPES.INVITE,
          actor: organizer.id,
          object: event.id,
          target: activity.object.target,
          to: activity.object.target
        });

        // Inform the inviter that his invitation has been accepted (this is not used currently)
        await ctx.call('activitypub.outbox.post', {
          collectionUri: organizer.outbox,
          type: ACTIVITY_TYPES.ACCEPT,
          actor: organizer.id,
          object: activity.id,
          to: activity.actor
        });
      }
    }
  },
  events: {
    async 'ldp.resource.created'(ctx) {
      const { resourceUri, newData } = ctx.params;

      if( hasType(newData, 'pair:Event') ) {
        const organizer = await ctx.call('activitypub.actor.get', { actorUri: newData['apods:organizedBy'] });

        const { groupUri: inviteesGroupUri } = await ctx.call('webacl.group.create', { groupSlug: this.getInviteesGroupSlug(resourceUri), webId: organizer.id });
        await ctx.call('webacl.group.create', { groupSlug: this.getInvitersGroupSlug(resourceUri), webId: organizer.id });

        // Give read rights for the event
        await ctx.call('webacl.resource.addRights', {
          resourceUri,
          additionalRights: {
            group: {
              uri: inviteesGroupUri,
              read: true
            }
          },
          webId: organizer.id
        });

        // Give read right for the organizer's profile
        await ctx.call('webacl.resource.addRights', {
          resourceUri: organizer.url,
          additionalRights: {
            group: {
              uri: inviteesGroupUri,
              read: true
            }
          },
          webId: organizer.id
        });

        // Give read right for the event's address
        await ctx.call('webacl.resource.addRights', {
          resourceUri: newData['pair:hostedIn'],
          additionalRights: {
            group: {
              uri: inviteesGroupUri,
              read: true
            }
          },
          webId: organizer.id
        });
      }
    }
  }
};
