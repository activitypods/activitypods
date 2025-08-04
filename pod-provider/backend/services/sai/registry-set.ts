import { triple, namedNode } from '@rdfjs/data-model';
import { SingleResourceContainerMixin } from '@semapps/ldp';

const RegistrySetSchema = {
  name: 'registry-set',
  mixins: [SingleResourceContainerMixin],
  settings: {
    acceptedTypes: ['interop:RegistrySet'],
    podProvider: true
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

export default RegistrySetSchema;
