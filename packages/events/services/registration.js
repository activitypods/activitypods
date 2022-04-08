const { MoleculerError } = require('moleculer').Errors;
const { ActivitiesHandlerMixin, OBJECT_TYPES } = require('@semapps/activitypub');
const { getAnnouncedGroupUri } = require('@activitypods/announcer');
const { JOIN_EVENT, LEAVE_EVENT } = require('../config/patterns');
const { JOIN_EVENT_MAPPING, LEAVE_EVENT_MAPPING } = require('../config/mappings');

module.exports = {
  name: 'events.registration',
  mixins: [ActivitiesHandlerMixin],
  dependencies: ['activitypub.registry', 'activity-mapping', 'ldp', 'webacl'],
  async started() {
    await this.broker.call('activitypub.registry.register', {
      path: '/attendees',
      attachToTypes: [OBJECT_TYPES.EVENT],
      attachPredicate: 'http://activitypods.org/ns/core#attendees',
      ordered: false,
      dereferenceItems: false,
    });

    await this.broker.call('activity-mapping.addMapper', {
      match: JOIN_EVENT,
      mapping: JOIN_EVENT_MAPPING
    });

    await this.broker.call('activity-mapping.addMapper', {
      match: LEAVE_EVENT,
      mapping: LEAVE_EVENT_MAPPING
    });
  },
  actions: {
    async addCreatorToAttendees(ctx) {
      const { resourceUri, newData } = ctx.params;
      await ctx.call('activitypub.collection.attach', {
        collectionUri: newData['apods:attendees'],
        item: newData['dc:creator'],
      });
    },
    async givePermissionsForAttendeesCollection(ctx) {
      const { resourceUri, newData } = ctx.params;

      await ctx.call('webacl.resource.addRights', {
        resourceUri: newData['apods:attendees'],
        additionalRights: {
          group: {
            uri: getAnnouncedGroupUri(resourceUri),
            read: true,
          },
        },
        webId: newData['dc:creator'],
      });
    }
  },
  activities: {
    joinEvent: {
      match: JOIN_EVENT,
      async onEmit(ctx, activity, emitterUri) {
        const emitter = await ctx.call('activitypub.actor.get', { actorUri: emitterUri, webId: 'system' });

        // If the emitter has a profile, it means the contacts app is activated
        if (emitter.url) {
          const organizerUri = activity.object['dc:creator'];

          // Ensure the organizer is in the contacts WebACL group of the emitter so he can see his profile (and write to him)
          // TODO put this in the contacts app ?
          await ctx.call('webacl.group.addMember', {
            groupSlug: new URL(emitterUri).pathname + '/contacts',
            memberUri: organizerUri,
            webId: emitterUri,
          });
        }
      },
      async onReceive(ctx, activity) {
        const event = activity.object;

        if (await ctx.call('events.status.isFinished', { event })) {
          throw new MoleculerError('This event is finished', 403, 'FORBIDDEN');
        } else if (await ctx.call('events.status.isClosed', { event })) {
          throw new MoleculerError('Registrations for this event are closed', 403, 'FORBIDDEN');
        }

        if (
          !(await ctx.call('activitypub.collection.includes', {
            collectionUri: event['apods:announced'],
            itemUri: activity.actor,
          }))
        ) {
          throw new MoleculerError('You have not been invited to this event', 400, 'BAD REQUEST');
        }

        await ctx.call('activitypub.collection.attach', {
          collectionUri: event['apods:attendees'],
          item: activity.actor,
        });

        // Tag event as closed if max attendees has been reached
        await ctx.call('events.status.tagUpdatedEvent', { eventUri: event.id });

        // TODO send confirmation mail to participant
      },
    },
    leaveEvent: {
      match: LEAVE_EVENT,
      async onReceive(ctx, activity) {
        const event = activity.object;

        if (
          !(await ctx.call('activitypub.collection.includes', {
            collectionUri: event['apods:attendees'],
            itemUri: activity.actor,
          }))
        ) {
          throw new MoleculerError('You are not attending this event', 400);
        } else if (await ctx.call('events.status.isFinished', { event })) {
          throw new MoleculerError('This event is closed', 403, 'FORBIDDEN');
        }

        await ctx.call('activitypub.collection.detach', {
          collectionUri: event['apods:attendees'],
          item: activity.actor,
        });

        // Tag event as open if the number of attendees is now lower than max attendees
        await ctx.call('events.status.tagUpdatedEvent', { eventUri: event.id });
      },
    },
  },
};
