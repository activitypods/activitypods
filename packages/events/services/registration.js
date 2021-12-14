const { MoleculerError } = require('moleculer').Errors;
const { defaultToArray } = require('@semapps/ldp');
const { ActivitiesHandlerMixin, OBJECT_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require("@semapps/mime-types");
const { JOIN_EVENT, LEAVE_EVENT } = require('../patterns');

module.exports = {
  name: 'events.registration',
  mixins: [ActivitiesHandlerMixin],
  dependencies: ['activitypub.registry', 'ldp', 'notification', 'webacl'],
  async started() {
    await this.broker.call('activitypub.registry.register', {
      path: '/attendees',
      attachToTypes: [OBJECT_TYPES.EVENT],
      attachPredicate: 'http://activitypods.org/ns/core#attendees',
      ordered: false,
      dereferenceItems: false,
      permissions: {}
    });
  },
  activities: {
    joinEvent: {
      match: JOIN_EVENT,
      async onReceive(ctx, activity) {
        const event = activity.object;

        if (await ctx.call('events.status.isFinished', {event})) {
          throw new MoleculerError('This event is finished', 403, 'FORBIDDEN');
        } else if (await ctx.call('events.status.isClosed', {event})) {
          throw new MoleculerError('Registrations for this event are closed', 403, 'FORBIDDEN');
        }

        if( !await ctx.call('activitypub.collection.includes', { collectionUri: event['apods:invitees'], item: activity.actor }) ) {
          throw new MoleculerError('You have not been invited to this event', 400, 'BAD REQUEST');
        }

        await ctx.call('activitypub.collection.attach', { collectionUri: event['apods:attendees'], item: activity.actor });

        await ctx.call('notification.joinOrLeave', {
          eventUri: event.id,
          userUri: activity.actor,
          joined: true
        });

        // TODO send confirmation mail to participant
      }
    },
    leaveEvent: {
      match: LEAVE_EVENT,
      async onReceive(ctx, activity) {
        const event = activity.object;

        if (!await ctx.call('activitypub.collection.includes', { collectionUri: event['apods:attendees'], item: activity.actor })) {
          throw new MoleculerError('You are not attending this event', 400);
        } else if (await ctx.call('events.status.isFinished', {event})) {
          throw new MoleculerError('This event is closed', 403, 'FORBIDDEN');
        }

        await ctx.call('activitypub.collection.detach', { collectionUri: event['apods:attendees'], item: activity.actor });

        await ctx.call('notification.joinOrLeave', {
          eventUri: event.id,
          userUri: activity.actor,
          joined: false
        });
      }
    }
  }
};
