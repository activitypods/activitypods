const { defaultToArray, hasType } = require('@semapps/ldp');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');

module.exports = {
  name: 'events.invitation',
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
    // If the one making the Offer is the organizer, it means it is an authorization to share
    async isOfferInviteByOrganizer(ctx, activity) {
      if ( activity.type === ACTIVITY_TYPES.OFFER && activity.object.type === ACTIVITY_TYPES.INVITE ) {
        const event = await ctx.call('activitypub.object.get', {
          objectUri: activity.object.object,
          actorUri: activity.actor
        });
        return activity.actor === event['apods:organizedBy'];
      }
    },
    // If the target of the Offer is the organizer, it is a request to share the event with someone else
    async isOfferInviteToOrganizer(ctx, activity) {
      if ( activity.type === ACTIVITY_TYPES.OFFER && activity.object.type === ACTIVITY_TYPES.INVITE ) {
        const event = await ctx.call('activitypub.object.get', {
          objectUri: activity.object.object,
          actorUri: activity.actor
        });
        return activity.target === event['apods:organizedBy'];
      }
    },
    getInviteesGroupSlug(eventUri) {
      return new URL(eventUri).pathname + '/invitees';
    },
    getInvitersGroupSlug(eventUri) {
      return new URL(eventUri).pathname + '/inviters';
    }
  },
  events: {
    async 'activitypub.outbox.posted'(ctx) {
      const { activity } = ctx.params;
      console.log('activitypub.outbox.posted', activity);
      if( activity.type === ACTIVITY_TYPES.INVITE ) {
        const event = await ctx.call('activitypub.object.get', { objectUri: activity.object, actorUri: activity.actor });

        if( activity.actor !== event['apods:organizedBy'] ) {
          throw new Error('Only the organizer has the right to invite people to the event ' + event.id)
        }

        // Add all invitees to the collection and WebACL group
        for( let inviteeUri of defaultToArray(activity.target) ) {
          await ctx.call('activitypub.collection.attach', { collectionUri: event['apods:invitees'], item: inviteeUri });

          await ctx.call('webacl.group.addMember', {
            groupSlug: this.getInviteesGroupSlug(event.id),
            memberUri: inviteeUri,
            webId: event['apods:organizedBy']
          })
        }
      } else if ( await this.isOfferInviteByOrganizer(ctx, activity) ) {
        const event = await ctx.call('activitypub.object.get', { objectUri: activity.object.object, actorUri: activity.actor });

        // Add all inviters to the collection and WebACL group
        for( let inviterUri of defaultToArray(activity.target) ) {
          await ctx.call('activitypub.collection.attach', { collectionUri: event['apods:inviters'], item: inviterUri });

          await ctx.call('webacl.group.addMember', {
            groupSlug: this.getInvitersGroupSlug(event.id),
            memberUri: inviterUri,
            webId: event['apods:organizedBy']
          })
        }
      }
    },
    async 'activitypub.inbox.received'(ctx) {
      const { activity, recipients } = ctx.params;
      // TODO check why we receive two activities with cc and to
      console.log('activitypub.inbox.received', activity, recipients);
      if( activity.type === ACTIVITY_TYPES.INVITE ) {
        for( let recipientUri of recipients ) {
          // Cache remote event (we want to be able to fetch it with SPARQL)
          await ctx.call('activitypub.object.cacheRemote', {
            objectUri: typeof activity.object === 'string' ? activity.object : activity.object.id,
            actorUri: recipientUri
          });

          // Send notification email
          await ctx.call('notification.invitation', {
            eventUri: typeof activity.object === 'string' ? activity.object : activity.object.id,
            senderUri: activity.actor,
            recipientUri
          });
        }
      } else if ( await this.isOfferInviteToOrganizer(ctx, activity) ) {
        const event = await ctx.call('activitypub.object.get', { objectUri: activity.object.object, actorUri: activity.actor });
        const organizer = await ctx.call('activitypub.actor.get', { actorUri: event['apods:organizedBy'] });

        const isInviter = await ctx.call('activitypub.collection.includes', {
          collectionUri: event['apods:inviters'],
          itemUri: activity.actor
        });

        if( !isInviter ) {
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
    },
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
