const { getId } = require('@semapps/ldp');

const ImmutableContainerMixin = {
  actions: {
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
      // The skipObjectsWatcher meta is used by the AccessGrantsMixin to avoid sending a Delete activity
      await this.actions.delete(
        { resourceUri: oldResourceUri, webId, doNotSendActivity: true },
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
  // ALTERNATIVE METHOD THAT ONLY CHANGE THE URL WITHOUT CALLING POST/DELETE
  // Possibly faster but requires to compare changes in put calls
  // hooks: {
  //   after: {
  //     // Change the URI but don't delete the resource to improve performance
  //     async put(ctx, res) {
  //       const oldResourceUri = res.resourceUri;
  //       const newResourceUri = await ctx.call('ldp.resource.generateId');

  //       // Get the list of resources linking the updated resource
  //       const results = await ctx.call('triplestore.query', {
  //         query: `
  //           SELECT ?s
  //           WHERE { ?s ?p <${oldResourceUri}> }
  //         `,
  //         webId: 'system'
  //       });

  //       await ctx.call('triplestore.update', {
  //         query: `
  //           DELETE { ?s ?p <${oldResourceUri}> }
  //           INSERT { ?s ?p <${newResourceUri}> }
  //           WHERE { ?s ?p <${oldResourceUri}> }
  //         `,
  //         webId: 'system'
  //       });

  //       // Call this now, otherwise the previous query would delete the interop:replaces URI
  //       await ctx.call('triplestore.update', {
  //         query: `
  //           PREFIX interop: <http://www.w3.org/ns/solid/interop#>
  //           DELETE {
  //             <${oldResourceUri}> ?p ?o .
  //             <${oldResourceUri}> interop:replaces ?previousUri .
  //           }
  //           INSERT {
  //             <${newResourceUri}> ?p ?o .
  //             <${newResourceUri}> interop:replaces <${oldResourceUri}> .
  //           }
  //           WHERE {
  //             <${oldResourceUri}> ?p ?o .
  //             OPTIONAL {
  //               <${oldResourceUri}> interop:replaces ?previousUri .
  //             }
  //           }
  //         `,
  //         webId: 'system'
  //       });

  //       if (this.broker.cacher) {
  //         await ctx.call('ldp.cache.invalidateResource', { resourceUri: oldResourceUri });
  //         // Invalidate all resources that were linking to this resource
  //         for (const resourceUri of results.map(r => r.collectionUri.value)) {
  //           await ctx.call('ldp.cache.invalidateResource', { resourceUri });
  //         }
  //       }

  //       return {
  //         resourceUri: newResourceUri,
  //         oldData: res.oldData,
  //         newData: { ...res.newData, id: newResourceUri },
  //         webId: res.webId
  //       };
  //     }
  //   }
  // }
};

module.exports = ImmutableContainerMixin;
