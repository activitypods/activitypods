const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'shacl',
  actions: {
    async get(ctx) {
      const { resourceUri } = ctx.params;
      return await ctx.call('ldp.remote.get', { resourceUri, accept: MIME_TYPES.JSON });
    },
    // Extract the required types from the SHACL shape
    async getTypes(ctx) {
      const { resourceUri } = ctx.params;
      const shape = await this.actions.get({ resourceUri }, { parentCtx: ctx });
      return shape[0]['http://www.w3.org/ns/shacl#targetClass']?.map(node => node['@id']) || [];
    }
  }
};
