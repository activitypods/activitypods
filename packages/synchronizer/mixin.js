const { OBJECT_TYPES } = require('@semapps/activitypub');
const { getContainerFromUri } = require('@semapps/ldp');
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
        webId,
      });

      await ctx.call('ldp.resource.put', {
        resource: {
          id: resourceUri,
          type: OBJECT_TYPES.TOMBSTONE,
          'as:formerType': oldData.type,
          deleted: new Date().toISOString(),
        },
        contentType: MIME_TYPES.JSON,
        webId,
      });

      await ctx.call('synchronizer.announceDelete', { objectUri: ctx.params.resourceUri, oldData });

      // Give anonymous read right since detached resources do not inherit rights from their containers
      // This must be called after synchronizer.announceDelete, otherwise the creator will not be able to view the resource rights anymore
      // TODO remove all write rights
      await ctx.call('webacl.resource.addRights', {
        resourceUri,
        newRights: {
          anon: {
            read: true,
          },
        },
        webId: 'system',
      });

      await ctx.call('ldp.container.detach', {
        containerUri: getContainerFromUri(resourceUri),
        resourceUri,
        webId,
      });

      const returnValues = {
        resourceUri,
        oldData,
        webId,
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
