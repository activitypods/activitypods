const { ControlledContainerMixin, hasType } = require('@semapps/ldp');
const { ACTIVITY_TYPES, ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { ANNOUNCE_UPDATE_EVENT } = require("../patterns");

module.exports = {
  name: 'events.event',
  mixins: [ControlledContainerMixin, ActivitiesHandlerMixin],
  settings: {
    path: '/events',
    acceptedTypes: ['pair:Event'],
    permissions: {},
    newResourcesPermissions: {}
  },
  actions: {
    async announceUpdate(ctx) {
      const { eventUri } = ctx.params;
      const event = await ctx.call('activitypub.object.get', { objectUri: eventUri, actorUri: ctx.meta.webId });
      const organizer = await ctx.call('activitypub.actor.get', { actorUri: event['apods:organizedBy'] });

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
    before: {
      post(ctx) {
        const { webId } = ctx.meta;
        ctx.params.resource = {
          ...ctx.params.resource,
          'apods:organizedBy': webId,
          'pair:involves': webId
        };
      }
    },
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
