const { SingleResourceContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'registry-set',
  mixins: [SingleResourceContainerMixin],
  settings: {
    acceptedTypes: ['interop:RegistrySet'],
    podProvider: true,
    description: {
      labelMap: {
        en: 'Registry Sets'
      },
      internal: true
    }
  },
  hooks: {
    after: {
      async post(ctx, res) {
        await ctx.call('ldp.resource.patch', {
          resourceUri: ctx.params.webId,
          triplesToAdd: [
            triple(
              namedNode(ctx.params.webId),
              namedNode('http://www.w3.org/ns/solid/interop#hasRegistrySet'),
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
