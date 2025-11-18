import rdf from '@rdfjs/data-model';
import { ControlledResourceMixin } from '@semapps/ldp';
import { ServiceSchema } from 'moleculer';

const RegistrySetService = {
  name: 'registry-set' as const,
  mixins: [ControlledResourceMixin],
  settings: {
    types: ['interop:RegistrySet']
  },
  hooks: {
    after: {
      async post(ctx, res) {
        await ctx.call('ldp.resource.patch', {
          resourceUri: ctx.params.webId,
          triplesToAdd: [
            rdf.quad(
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

export default RegistrySetService;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [RegistrySetService.name]: typeof RegistrySetService;
    }
  }
}
