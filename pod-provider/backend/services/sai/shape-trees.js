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
    }
  }
};
