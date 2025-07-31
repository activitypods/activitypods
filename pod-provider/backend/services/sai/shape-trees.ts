import { MIME_TYPES } from '@semapps/mime-types';
import { ServiceSchema, defineAction } from 'moleculer';

const ShapeTreesServiceSchema = {
  name: 'shape-trees' as const,

  actions: {
    get: defineAction({
      async handler(ctx: any) {
        const { resourceUri } = ctx.params;
        return await ctx.call('ldp.remote.get', { resourceUri, accept: MIME_TYPES.JSON });
      }
    }),

    getShapeUri: defineAction({
      // Extract the shape from the shape tree
      async handler(ctx: any) {
        const { resourceUri } = ctx.params;
        const shapeTree = await this.actions.get({ resourceUri }, { parentCtx: ctx });
        return shapeTree[0]['http://www.w3.org/ns/shapetrees#shape']?.[0]?.['@id'];
      }
    }),

    getShape: defineAction({
      // TODO Remove when the following commit has been released
      // https://github.com/assemblee-virtuelle/semapps/commit/7854a20c71239f7b305b99257103b03c3c0465e8
      async handler(ctx: any) {
        return this.actions.getShapeUri(ctx.params, { parentCtx: ctx });
      }
    })
  }
} satisfies ServiceSchema;

export default ShapeTreesServiceSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [ShapeTreesServiceSchema.name]: typeof ShapeTreesServiceSchema;
    }
  }
}
