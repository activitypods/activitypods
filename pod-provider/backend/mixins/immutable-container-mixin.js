const { getId } = require('@semapps/ldp');

const ImmutableContainerMixin = {
  actions: {
    // TODO Change the URI but don't delete the resource to improve performance
    // Warning: We must ensure all cache for the previous URL are invalidated
    async put(ctx) {
      const { resource, contentType } = ctx.params;
      const webId = ctx.params.webId || ctx.meta.webId;
      const oldData = await this.actions.get({ resourceUri: getId(resource), webId });
      await this.actions.delete({ resourceUri: getId(resource), webId });
      delete resource.id;
      const resourceUri = await this.actions.post({ resource, contentType, webId });
      return { resourceUri, oldData, newData: { id: resourceUri, ...resource }, webId };
    },
    patch() {
      throw new Error(
        `The resources of type ${this.settings.acceptedTypes.join(', ')} are immutable. PATCH is disabled.`
      );
    }
  }
};

module.exports = ImmutableContainerMixin;
