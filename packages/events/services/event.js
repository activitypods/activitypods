const { ControlledContainerMixin, hasType } = require('@semapps/ldp');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');

module.exports = {
  name: 'events.event',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/events',
    acceptedTypes: ['pair:Event'],
    permissions: {},
    newResourcesPermissions: {}
  },
  actions: {
    async announceUpdate(ctx) {
      const { eventUri } = ctx.params;
      const event = await ctx.call('activitypub.object.get', { objectUri: eventUri });
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
  methods:  {
    async isEventUpdate(ctx, activity) {
      if( activity.type === ACTIVITY_TYPES.ANNOUNCE && activity.object.type === ACTIVITY_TYPES.UPDATE ) {
        const object = await ctx.call('activitypub.object.get', { objectUri: activity.object.object, actorUri: activity.actor });
        return hasType(object, 'pair:Event');
      }
      return false;
    }
  },
  events: {
    async 'activitypub.inbox.received'(ctx) {
      const { activity, recipients } = ctx.params;
      if( await this.isEventUpdate(ctx, activity) ) {
        for( let recipientUri of recipients ) {
          await ctx.call('activitypub.object.cacheRemote', {
            objectUri: activity.object.object,
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
      },
      patch(ctx, res) {
        this.actions.announceUpdate({ eventUri: res }, { parentCtx: ctx });
      },
      async post(ctx, res) {
        await ctx.call('events.status.tagNewEvent', { eventUri: res });
      }
    }
  }
};
