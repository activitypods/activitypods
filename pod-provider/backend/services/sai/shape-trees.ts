// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { MIME_TYPES } from '@semapps/mime-types';

export default {
  name: 'shape-trees',
  actions: {
    async get(ctx: any) {
      const { resourceUri } = ctx.params;
      return await ctx.call('ldp.remote.get', { resourceUri, accept: MIME_TYPES.JSON });
    },
    // Extract the shape from the shape tree
    // @ts-expect-error TS(7023): 'getShapeUri' implicitly has return type 'any' bec... Remove this comment to see the full error message
    async getShapeUri(ctx: any) {
      const { resourceUri } = ctx.params;
      // @ts-expect-error TS(7022): 'shapeTree' implicitly has type 'any' because it d... Remove this comment to see the full error message
      const shapeTree = await this.actions.get({ resourceUri }, { parentCtx: ctx });
      return shapeTree[0]['http://www.w3.org/ns/shapetrees#shape']?.[0]?.['@id'];
    },
    // TODO Remove when the following commit has been released
    // https://github.com/assemblee-virtuelle/semapps/commit/7854a20c71239f7b305b99257103b03c3c0465e8
    // @ts-expect-error TS(7023): 'getShape' implicitly has return type 'any' becaus... Remove this comment to see the full error message
    async getShape(ctx: any) {
      // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ get(c... Remove this comment to see the full error message
      return this.actions.getShapeUri(ctx.params, { parentCtx: ctx });
    }
  }
};
