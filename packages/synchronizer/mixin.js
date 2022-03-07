const { OBJECT_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  dependencies: ['synchronizer'],
  async started() {
    await this.broker.call('synchronizer.watch', { types: this.settings.acceptedTypes });
  },
  actions: {
    async delete(ctx) {
      const { resourceUri } = ctx.params;
      const webId = ctx.params.webId || ctx.meta.webId || 'anon';

      const oldData = await ctx.call('ldp.resource.get', {
        resourceUri,
        accept: MIME_TYPES.JSON,
        webId
      });

      await ctx.call('ldp.resource.put', {
        resource: {
          id: resourceUri,
          type: OBJECT_TYPES.TOMBSTONE,
          'as:formerType': oldData.type,
          deleted: new Date().toISOString()
        },
        contentType: MIME_TYPES.JSON,
        webId
      });

      await ctx.call('synchronizer.announceDelete', { objectUri: ctx.params.resourceUri, oldData });

      const returnValues = {
        resourceUri,
        oldData,
        webId
      };

      ctx.emit('ldp.resource.deleted', returnValues, { meta: { webId: null, dataset: null } });

      return returnValues;
    },
  },
  hooks: {
    after: {
      async patch(ctx, res) {
        await ctx.call('synchronizer.announceUpdate', { objectUri: res.resourceUri, newData: res.newData });
        return res;
      },
      async put(ctx, res) {
        await ctx.call('synchronizer.announceUpdate', { objectUri: res.resourceUri, newData: res.newData });
        return res;
      },
    },
  },
};
