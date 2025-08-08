import rdf from '@rdfjs/data-model';
import { SingleResourceContainerMixin } from '@semapps/ldp';
import { ServiceSchema } from 'moleculer';

const RegistrySetSchema = {
  name: 'registry-set' as const,
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
            rdf.triple(
              rdf.namedNode(ctx.params.webId),
              rdf.namedNode('http://www.w3.org/ns/solid/interop#hasRegistrySet'),
              rdf.namedNode(res)
            )
          ],
          webId: 'system'
        });
        return res;
      }
    }
  }
} satisfies ServiceSchema;

export default RegistrySetSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [RegistrySetSchema.name]: typeof RegistrySetSchema;
    }
  }
}
