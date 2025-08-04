const { ACTIVITY_TYPES, OBJECT_TYPES, matchActivity } = require('@semapps/activitypub');
const PodActivitiesHandlerMixin = require('./pod-activities-handler');
const ShapeTreeFetcherMixin = require('./shape-tree-fetcher');

module.exports = {
  mixins: [PodActivitiesHandlerMixin, ShapeTreeFetcherMixin],
  settings: {
    shapeTreeUri: null,
    type: null // Automatically set by the ShapeTreeFetcherMixin
  },
  dependencies: ['pod-resources'],
  actions: {
    async post(ctx) {
      if (!ctx.params.containerUri) {
        ctx.params.containerUri = await this.actions.getContainerUri(
          { actorUri: ctx.params.actorUri },
          { parentCtx: ctx }
        );
      }
      return await ctx.call('pod-resources.post', ctx.params);
    },
    async list(ctx) {
      if (!ctx.params.containerUri) {
        ctx.params.containerUri = await this.actions.getContainerUri(
          { actorUri: ctx.params.actorUri },
          { parentCtx: ctx }
        );
      }
      return await ctx.call('pod-resources.list', ctx.params);
    },
    async get(ctx) {
      return await ctx.call('pod-resources.get', ctx.params);
    },
    async patch(ctx) {
      return await ctx.call('pod-resources.patch', ctx.params);
    },
    async put(ctx) {
      return await ctx.call('pod-resources.put', ctx.params);
    },
    async delete(ctx) {
      return await ctx.call('pod-resources.delete', ctx.params);
    },
    async getContainerUri(ctx) {
      return await ctx.call('access-grants.getContainerByShapeTree', {
        shapeTreeUri: this.settings.shapeTreeUri,
        podOwner: ctx.params.actorUri
      });
    }
  },
  activities: {
    create: {
      async match(activity, fetcher) {
        if (!this.onCreate) return { match: false, dereferencedActivity: activity };
        return matchActivity(
          {
            type: ACTIVITY_TYPES.CREATE,
            object: {
              type: this.settings.type
            }
          },
          activity,
          fetcher
        );
      },
      async onEmit(ctx, activity) {
        await this.onCreate(ctx, activity.object, activity.actor);
      }
    },
    update: {
      async match(activity, fetcher) {
        if (!this.onUpdate) return { match: false, dereferencedActivity: activity };
        return matchActivity(
          {
            type: ACTIVITY_TYPES.UPDATE,
            object: {
              type: this.settings.type
            }
          },
          activity,
          fetcher
        );
      },
      async onEmit(ctx, activity) {
        await this.onUpdate(ctx, activity.object, activity.actor);
      }
    },
    delete: {
      async match(activity, fetcher) {
        if (!this.onUpdate) return { match: false, dereferencedActivity: activity };
        return matchActivity(
          {
            type: ACTIVITY_TYPES.DELETE,
            object: {
              type: OBJECT_TYPES.TOMBSTONE,
              formerType: this.settings.type
            }
          },
          activity,
          fetcher
        );
      },
      async onEmit(ctx, activity) {
        await this.onUpdate(ctx, activity.object, activity.actor);
      }
    }
  }
};
