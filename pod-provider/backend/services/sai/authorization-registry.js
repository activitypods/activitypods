const { triple, namedNode } = require('@rdfjs/data-model');
const { SingleResourceContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'authorization-registry',
  mixins: [SingleResourceContainerMixin],
  settings: {
    acceptedTypes: ['interop:AuthorizationRegistry'],
    podProvider: true,
    description: {
      labelMap: {
        en: 'Authorization Registries'
      },
      internal: true
    }
  },
  dependencies: ['registry-set'],
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
              namedNode('http://www.w3.org/ns/solid/interop#hasAuthorizationRegistry'),
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
