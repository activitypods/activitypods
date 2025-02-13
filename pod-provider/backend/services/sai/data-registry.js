const { triple, namedNode } = require('@rdfjs/data-model');
const { SingleResourceContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'data-registry',
  mixins: [SingleResourceContainerMixin],
  settings: {
    acceptedTypes: ['interop:DataRegistry'],
    podProvider: true
  },
  dependencies: ['registry-set'],
  actions: {
    async add(ctx) {
      const { podOwner, dataRegistrationUri } = ctx.params;

      const dataRegistryUri = await this.actions.getResourceUri({ webId: podOwner }, { parentCtx: ctx });

      await this.actions.patch(
        {
          resourceUri: dataRegistryUri,
          triplesToAdd: [
            triple(
              namedNode(dataRegistryUri),
              namedNode('http://www.w3.org/ns/solid/interop#hasDataRegistration'),
              namedNode(dataRegistrationUri)
            )
          ],
          webId: 'system'
        },
        { parentCtx: ctx }
      );
    },
    async remove(ctx) {
      const { podOwner, dataRegistrationUri } = ctx.params;

      const dataRegistryUri = await this.actions.getResourceUri({ webId: podOwner }, { parentCtx: ctx });

      await this.actions.patch(
        {
          resourceUri: dataRegistryUri,
          triplesToRemove: [
            triple(
              namedNode(dataRegistryUri),
              namedNode('http://www.w3.org/ns/solid/interop#hasDataRegistration'),
              namedNode(dataRegistrationUri)
            )
          ],
          webId: 'system'
        },
        { parentCtx: ctx }
      );
    }
  },
  hooks: {
    after: {
      async post(ctx, res) {
        // Attach the registry to the registry set
        const registrySetUri = await ctx.call('registry-set.getResourceUri', { webId: ctx.params.webId });
        await ctx.call('registry-set.patch', {
          resourceUri: registrySetUri,
          triplesToAdd: [
            triple(
              namedNode(registrySetUri),
              namedNode('http://www.w3.org/ns/solid/interop#hasDataRegistry'),
              namedNode(res)
            )
          ],
          webId: 'system'
        });
        return res;
      }
    }
  }
};
