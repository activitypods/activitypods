import { ACTIVITY_TYPES, OBJECT_TYPES, matchActivity } from '@semapps/activitypub';
import PodActivitiesHandlerMixin from './pod-activities-handler.ts';
import ShapeTreeFetcherMixin from './shape-tree-fetcher.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  mixins: [PodActivitiesHandlerMixin, ShapeTreeFetcherMixin],
  settings: {
    shapeTreeUri: null,
    type: null // Automatically set by the ShapeTreeFetcherMixin
  },
  dependencies: ['pod-resources'],
  actions: {
    post: {
      async handler(ctx: any) {
        if (!ctx.params.containerUri) {
          ctx.params.containerUri = await this.actions.getContainerUri({}, { parentCtx: ctx });
        }
        return await ctx.call('pod-resources.post', ctx.params);
      }
    },

    list: {
      async handler(ctx: any) {
        if (!ctx.params.containerUri) {
          ctx.params.containerUri = await this.actions.getContainerUri({}, { parentCtx: ctx });
        }
        return await ctx.call('pod-resources.list', ctx.params);
      }
    },

    get: {
      async handler(ctx: any) {
        return await ctx.call('pod-resources.get', ctx.params);
      }
    },

    patch: {
      async handler(ctx: any) {
        return await ctx.call('pod-resources.patch', ctx.params);
      }
    },

    put: {
      async handler(ctx: any) {
        return await ctx.call('pod-resources.put', ctx.params);
      }
    },

    delete: {
      async handler(ctx: any) {
        return await ctx.call('pod-resources.delete', ctx.params);
      }
    },

    getContainerUri: {
      async handler(ctx: any) {
        return await ctx.call('access-grants.getContainerByShapeTree', { shapeTreeUri: this.settings.shapeTreeUri });
      }
    }
  },
  activities: {
    create: {
      async match(activity: any, fetcher: any) {
        // @ts-expect-error TS(2339): Property 'onCreate' does not exist on type '{ matc... Remove this comment to see the full error message
        if (!this.onCreate) return { match: false, dereferencedActivity: activity };
        return matchActivity(
          {
            type: ACTIVITY_TYPES.CREATE,
            object: {
              // @ts-expect-error TS(2339): Property 'settings' does not exist on type '{ matc... Remove this comment to see the full error message
              type: this.settings.type
            }
          },
          activity,
          fetcher
        );
      },
      async onEmit(ctx: any, activity: any) {
        // @ts-expect-error TS(2339): Property 'onCreate' does not exist on type '{ matc... Remove this comment to see the full error message
        await this.onCreate(ctx, activity.object, activity.actor);
      }
    },
    update: {
      async match(activity: any, fetcher: any) {
        // @ts-expect-error TS(2339): Property 'onUpdate' does not exist on type '{ matc... Remove this comment to see the full error message
        if (!this.onUpdate) return { match: false, dereferencedActivity: activity };
        return matchActivity(
          {
            type: ACTIVITY_TYPES.UPDATE,
            object: {
              // @ts-expect-error TS(2339): Property 'settings' does not exist on type '{ matc... Remove this comment to see the full error message
              type: this.settings.type
            }
          },
          activity,
          fetcher
        );
      },
      async onEmit(ctx: any, activity: any) {
        // @ts-expect-error TS(2339): Property 'onUpdate' does not exist on type '{ matc... Remove this comment to see the full error message
        await this.onUpdate(ctx, activity.object, activity.actor);
      }
    },
    delete: {
      async match(activity: any, fetcher: any) {
        // @ts-expect-error TS(2339): Property 'onUpdate' does not exist on type '{ matc... Remove this comment to see the full error message
        if (!this.onUpdate) return { match: false, dereferencedActivity: activity };
        return matchActivity(
          {
            type: ACTIVITY_TYPES.DELETE,
            object: {
              type: OBJECT_TYPES.TOMBSTONE,
              // @ts-expect-error TS(2339): Property 'settings' does not exist on type '{ matc... Remove this comment to see the full error message
              formerType: this.settings.type
            }
          },
          activity,
          fetcher
        );
      },
      async onEmit(ctx: any, activity: any) {
        // @ts-expect-error TS(2339): Property 'onUpdate' does not exist on type '{ matc... Remove this comment to see the full error message
        await this.onUpdate(ctx, activity.object, activity.actor);
      }
    }
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
