import { getId } from '@semapps/ldp';

const ImmutableContainerMixin = {
  actions: {
    // @ts-expect-error TS(7023): 'put' implicitly has return type 'any' because it ... Remove this comment to see the full error message
    async put(ctx: any) {
      const { resource, contentType } = ctx.params;
      const webId = ctx.params.webId || ctx.meta.webId;

      // Extract old resource URI
      const oldResourceUri = getId(resource);
      delete resource.id;

      // Get old resource (will be returned by the action)
      // @ts-expect-error TS(7022): 'oldData' implicitly has type 'any' because it doe... Remove this comment to see the full error message
      const oldData = await this.actions.get({ resourceUri: oldResourceUri, webId }, { parentCtx: ctx });

      // Post new resource
      // @ts-expect-error TS(7022): 'newResourceUri' implicitly has type 'any' because... Remove this comment to see the full error message
      const newResourceUri = await this.actions.post(
        {
          resource: { ...resource, 'interop:replaces': oldResourceUri },
          contentType,
          webId
        },
        { parentCtx: ctx }
      );

      // Delete old resource (after creating the new resource, in case we want to compare them)
      // The isReplacing param is used by the AccessGrantsMixin
      // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ put(c... Remove this comment to see the full error message
      await this.actions.delete({ resourceUri: oldResourceUri, webId, isReplacing: true }, { parentCtx: ctx });

      return { resourceUri: newResourceUri, oldData, newData: { id: newResourceUri, ...resource }, webId };
    },
    patch() {
      throw new Error(
        // @ts-expect-error TS(2339): Property 'settings' does not exist on type '{ put(... Remove this comment to see the full error message
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

export default ImmutableContainerMixin;
