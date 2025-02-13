const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'shape-trees',
  actions: {
    async get(ctx) {
      const { resourceUri } = ctx.params;
      return await ctx.call('ldp.remote.get', { resourceUri, accept: MIME_TYPES.JSON });
    }
  }
};
