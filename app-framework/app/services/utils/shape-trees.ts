import { MIME_TYPES } from '@semapps/mime-types';
import { ServiceSchema } from 'moleculer';

const ShapeTreesSchema = {
  name: 'shape-trees' as const,
  actions: {
    get: {
      async handler(ctx) {
        const { resourceUri } = ctx.params;
        return await ctx.call('ldp.remote.get', { resourceUri, accept: MIME_TYPES.JSON });
      }
    },

    getShapeUri: {
      // Extract the shape from the shape tree
      async handler(ctx) {
        const { resourceUri } = ctx.params;
        const shapeTree = await this.actions.get({ resourceUri }, { parentCtx: ctx });
        return shapeTree[0]['http://www.w3.org/ns/shapetrees#shape']?.[0]?.['@id'];
      }
    },

    getShape: {
      // TODO Remove when the following commit has been released
      // https://github.com/assemblee-virtuelle/semapps/commit/7854a20c71239f7b305b99257103b03c3c0465e8
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        return this.actions.getShapeUri(ctx.params, { parentCtx: ctx });
      }
    }
  }
} satisfies ServiceSchema;

export default ShapeTreesSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [ShapeTreesSchema.name]: typeof ShapeTreesSchema;
    }
  }
}
