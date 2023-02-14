const { ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { REMOVE_CONTACT } = require("../config/patterns");

module.exports = {
  name: 'contacts.manager',
  mixins: [ActivitiesHandlerMixin],
  activities: {
    removeContact: {
      match: REMOVE_CONTACT,
      async onEmit(ctx, activity, emitterUri) {
        if (!activity.origin)
          throw new Error('The origin property is missing from the Remove activity');

        if (!activity.origin.startsWith(emitterUri))
          throw new Error(`Cannot remove from collection ${activity.origin} as it is not owned by the emitter`);

        await ctx.call('activitypub.collection.detach', {
          collectionUri: activity.origin,
          item: activity.object.id,
        });

        const actor = await ctx.call('activitypub.actor.get', { actorUri: activity.object.id, webId: activity.object.id });

        await ctx.call('mirror.resource.delete', {
          resourceUri: emitterUri,
          webId: actor.url,
        });
      }
    },
  }
};
