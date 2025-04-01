const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'shape-trees',
  actions: {
    async get(ctx) {
      const { resourceUri } = ctx.params;
      return await ctx.call('ldp.remote.get', { resourceUri, accept: MIME_TYPES.JSON });
    },
    // Extract the shape from the shape tree
    async getShapeUri(ctx) {
      const { resourceUri } = ctx.params;
      const shapeTree = await this.actions.get({ resourceUri }, { parentCtx: ctx });
      return shapeTree[0]['http://www.w3.org/ns/shapetrees#shape']?.[0]?.['@id'];
    },
    // TODO Remove when the following commit has been released
    // https://github.com/assemblee-virtuelle/semapps/commit/7854a20c71239f7b305b99257103b03c3c0465e8
    async getShape(ctx) {
      return this.actions.getShapeUri(ctx.params, { parentCtx: ctx });
    }
  }
};
