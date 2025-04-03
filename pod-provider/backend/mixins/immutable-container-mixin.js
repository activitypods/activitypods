const ImmutableContainerMixin = {
  actions: {
    // TODO Change the URI but don't delete the resource to improve performance
    // Warning: We must ensure all cache for the previous URL are invalidated
    async put(ctx) {
      const { resource, contentType, webId } = ctx.params;
      const oldData = await this.actions.get({ resourceUri: resource.id || resource['@id'], webId });
      await this.actions.delete({ resourceUri: resource.id || resource['@id'], webId });
      const resourceUri = await this.actions.post({ resource, contentType, webId });
      return { resourceUri, oldData, newData: resource, webId };
    },
    patch() {
      throw new Error(
        `The resources of type ${this.settings.acceptedTypes.join(', ')} are immutable. PATCH is disabled.`
      );
    }
  }
};

module.exports = ImmutableContainerMixin;
