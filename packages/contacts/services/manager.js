const { ActivitiesHandlerMixin, ACTOR_TYPES } = require('@semapps/activitypub');
const { REMOVE_CONTACT, IGNORE_CONTACT, UNDO_IGNORE_CONTACT } = require('../config/patterns');

module.exports = {
  name: 'contacts.manager',
  mixins: [ActivitiesHandlerMixin],
    dependencies: ['activitypub.registry', 'activity-mapping', 'webacl'],

  async started() {
    await this.broker.call('activitypub.registry.register', {
      path: '/ignored-contacts',
      attachToTypes: Object.values(ACTOR_TYPES),
      attachPredicate: 'http://activitypods.org/ns/core#ignoredContacts',
      ordered: false,
      dereferenceItems: false,
    });

  },
  activities: {
    removeContact: {
      match: REMOVE_CONTACT,
      async onEmit(ctx, activity, emitterUri) {
        if (!activity.origin) throw new Error('The origin property is missing from the Remove activity');

        if (!activity.origin.startsWith(emitterUri))
          throw new Error(`Cannot remove from collection ${activity.origin} as it is not owned by the emitter`);

        await ctx.call('activitypub.collection.detach', {
          collectionUri: activity.origin,
          item: activity.object.id,
        });

        const actor = await ctx.call('activitypub.actor.get', {
          actorUri: activity.object.id,
          webId: activity.object.id,
        });

        await ctx.call('activitypub.object.deleteFromCache', {
          actorUri: emitterUri,
          objectUri: actor.url,
        });
      },
    },
    ignoreContact: {
      match: IGNORE_CONTACT,
      async onEmit(ctx, activity, emitterUri) {
        const emitter = await ctx.call('activitypub.actor.get', { actorUri: emitterUri });

        // Add the actor to its ignore contacts list
        await ctx.call('activitypub.collection.attach', {
          collectionUri: emitter['apods:ignoredContacts'],
          item: activity.object,
        });
      },
    },
    undoIngoreContact: {
      match: UNDO_IGNORE_CONTACT,
      async onEmit(ctx, activity, emitterUri) {
        const emitter = await ctx.call('activitypub.actor.get', { actorUri: emitterUri });

        // Add the actor to its ignore contacts list
        await ctx.call('activitypub.collection.detach', {
          collectionUri: emitter['apods:ignoredContacts'],
          item: activity.object.object,
        });
      },
    },

  },
};
