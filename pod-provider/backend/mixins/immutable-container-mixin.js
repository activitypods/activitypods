const { getId } = require('@semapps/ldp');

const ImmutableContainerMixin = {
  actions: {
    // TODO Change the URI but don't delete the resource to improve performance
    // Warning: If we do that, we must ensure all cache for the previous URL are invalidated
    async put(ctx) {
      const { resource, contentType } = ctx.params;
      const webId = ctx.params.webId || ctx.meta.webId;

      // Extract old resource URI
      const oldResourceUri = getId(resource);
      delete resource.id;

      // Get old resource (will be returned by the action)
      const oldData = await this.actions.get({ resourceUri: oldResourceUri, webId }, { parentCtx: ctx });

      // Post new resource
      const newResourceUri = await this.actions.post(
        {
          resource: { ...resource, 'interop:replaces': oldResourceUri },
          contentType,
          webId
        },
        { parentCtx: ctx }
      );

      // Delete old resource (after creating the new resource, in case we want to compare them)
      // Don't generate a Delete activity to reduce the noise (old resources can be deleted with `interop:replaces`)
      await this.actions.delete(
        { resourceUri: oldResourceUri, webId },
        { meta: { skipObjectsWatcher: true }, parentCtx: ctx }
      );

      return { resourceUri: newResourceUri, oldData, newData: { id: newResourceUri, ...resource }, webId };
    },
    patch() {
      throw new Error(
        `The resources of type ${this.settings.acceptedTypes.join(', ')} are immutable. PATCH is disabled.`
      );
    }
  }
};

module.exports = ImmutableContainerMixin;
