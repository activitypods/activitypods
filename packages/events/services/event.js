const { ControlledContainerMixin } = require('@semapps/ldp');
const { ACTIVITY_TYPES, OBJECT_TYPES, ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { ANNOUNCE_UPDATE_EVENT } = require("../patterns");

module.exports = {
  name: 'events.event',
  mixins: [ControlledContainerMixin, ActivitiesHandlerMixin],
  settings: {
    path: '/events',
    acceptedTypes: [OBJECT_TYPES.EVENT],
    permissions: {},
    newResourcesPermissions: {}
  },
  actions: {
    async announceUpdate(ctx) {
      const { eventUri } = ctx.params;
      const event = await ctx.call('activitypub.object.get', { objectUri: eventUri, actorUri: ctx.meta.webId });
      const organizer = await ctx.call('activitypub.actor.get', { actorUri: event['dc:creator'] });

      const collection = await ctx.call('activitypub.collection.get', { collectionUri: event['apods:invitees'] });
      if (collection && collection.items) {
        await ctx.call('activitypub.outbox.post', {
          collectionUri: organizer.outbox,
          type: ACTIVITY_TYPES.ANNOUNCE,
          actor: organizer.id,
          object: {
            type: ACTIVITY_TYPES.UPDATE,
            object: eventUri
          },
          to: collection.items
        });
      }
    }
  },
  activities: {
    announceUpdateEvent: {
      match: ANNOUNCE_UPDATE_EVENT,
      async onReceive(ctx, activity, recipients) {
        for( let recipientUri of recipients ) {
          await ctx.call('activitypub.object.cacheRemote', {
            objectUri: activity.object.object.id,
            actorUri: recipientUri
          });
        }
      }
    }
  },
  hooks: {
    after: {
      put(ctx, res) {
        this.actions.announceUpdate({ eventUri: res }, { parentCtx: ctx });
        return res;
      },
      patch(ctx, res) {
        this.actions.announceUpdate({ eventUri: res }, { parentCtx: ctx });
        return res;
      },
      async post(ctx, res) {
        await ctx.call('events.status.tagNewEvent', { eventUri: res });
        return res;
      }
    }
  }
};
