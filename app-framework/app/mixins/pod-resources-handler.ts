import { ACTIVITY_TYPES, OBJECT_TYPES, matchActivity } from '@semapps/activitypub';
import PodActivitiesHandlerMixin from './pod-activities-handler.ts';
import ShapeTreeFetcherMixin from './shape-tree-fetcher.ts';
import { ServiceSchema, defineAction } from 'moleculer';

const Schema = {
  mixins: [PodActivitiesHandlerMixin, ShapeTreeFetcherMixin],
  settings: {
    shapeTreeUri: null,
    type: null // Automatically set by the ShapeTreeFetcherMixin
  },
  dependencies: ['pod-resources'],
  actions: {
    post: defineAction({
      async handler(ctx) {
        if (!ctx.params.containerUri) {
          ctx.params.containerUri = await this.actions.getContainerUri(
            { actorUri: ctx.params.actorUri },
            { parentCtx: ctx }
          );
        }
        return await ctx.call('pod-resources.post', ctx.params);
      }
    }),

    list: defineAction({
      async handler(ctx) {
        if (!ctx.params.containerUri) {
          ctx.params.containerUri = await this.actions.getContainerUri(
            { actorUri: ctx.params.actorUri },
            { parentCtx: ctx }
          );
        }
        return await ctx.call('pod-resources.list', ctx.params);
      }
    }),

    get: defineAction({
      async handler(ctx) {
        return await ctx.call('pod-resources.get', ctx.params);
      }
    }),

    patch: defineAction({
      async handler(ctx) {
        return await ctx.call('pod-resources.patch', ctx.params);
      }
    }),

    put: defineAction({
      async handler(ctx) {
        return await ctx.call('pod-resources.put', ctx.params);
      }
    }),

    delete: defineAction({
      async handler(ctx) {
        return await ctx.call('pod-resources.delete', ctx.params);
      }
    }),

    getContainerUri: defineAction({
      async handler(ctx) {
        return await ctx.call('access-grants.getContainerByShapeTree', {
          shapeTreeUri: this.settings.shapeTreeUri,
          podOwner: ctx.params.actorUri
        });
      }
    })
  },
  activities: {
    create: {
      async match(activity: any, fetcher: any) {
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
      async onEmit(ctx: any, activity: any) {
        await this.onCreate(ctx, activity.object, activity.actor);
      }
    },
    update: {
      async match(activity: any, fetcher: any) {
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
      async onEmit(ctx: any, activity: any) {
        await this.onUpdate(ctx, activity.object, activity.actor);
      }
    },
    delete: {
      async match(activity: any, fetcher: any) {
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
      async onEmit(ctx: any, activity: any) {
        await this.onUpdate(ctx, activity.object, activity.actor);
      }
    }
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
