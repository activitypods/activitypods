const { MoleculerError } = require('moleculer').Errors;
const { ActivitiesHandlerMixin, OBJECT_TYPES } = require('@semapps/activitypub');
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
      dereferenceItems: false
    });
  },
  methods: {
    async notifyJoinOrLeave(ctx, eventUri, userUri, joined) {
      const userProfile = await ctx.call('activitypub.actor.getProfile', { actorUri: userUri, webId: 'system' });
      const event = await ctx.call('events.event.get', { resourceUri: eventUri, webId: 'system' });

      const title = joined
        ? `${userProfile['vcard:given-name']} s'est inscrit à votre événement "${event.name}"`
        : `${userProfile['vcard:given-name']} s'est désinscrit de votre événement "${event.name}"`

      await ctx.call('notification.notifyUser', {
        to: event['dc:creator'],
        key: joined ? 'join-event' : 'leave-event',
        payload: {
          title,
          actions: [{
            name: 'Voir',
            link: '/e/' + encodeURIComponent(eventUri),
          }]
        }
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

          const rights = await ctx.call('webacl.resource.hasRights', {
            resourceUri: emitter.url,
            rights: { read: true },
            webId: organizerUri,
          });

          // If the organizer cannot view my profile, give him the right
          // TODO if the organizer is added later through the contacts app, remove this right
          if (rights && rights.read !== true) {
            await ctx.call('webacl.resource.addRights', {
              resourceUri: emitter.url,
              additionalRights: {
                user: {
                  uri: organizerUri,
                  read: true,
                },
              },
              webId: emitter.id,
            });
          }
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
            collectionUri: event['apods:invitees'],
            itemUri: activity.actor,
          }))
        ) {
          throw new MoleculerError('You have not been invited to this event', 400, 'BAD REQUEST');
        }

        await ctx.call('activitypub.collection.attach', {
          collectionUri: event['apods:attendees'],
          item: activity.actor,
        });

        await this.notifyJoinOrLeave(ctx, event.id, activity.actor, true);

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

        await this.notifyJoinOrLeave(ctx, event.id, activity.actor, false);
      },
    },
  },
};
