import rdf from '@rdfjs/data-model';
import { ControlledResourceMixin } from '@semapps/ldp';
import { ServiceSchema } from 'moleculer';

const RegistrySetService = {
  name: 'registry-set' as const,
  mixins: [ControlledResourceMixin],
  settings: {
    path: '/registry-set',
    types: ['interop:RegistrySet']
  },
  hooks: {
    after: {
      async create(ctx, res) {
        const webId = await ctx.call('webid.getUri');
        await ctx.call('ldp.resource.patch', {
          resourceUri: webId,
          triplesToAdd: [
            rdf.quad(
              rdf.namedNode(webId),
              rdf.namedNode('http://www.w3.org/ns/solid/interop#hasRegistrySet'),
              rdf.namedNode(res.resourceUri)
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
