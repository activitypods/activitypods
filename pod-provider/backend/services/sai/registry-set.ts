import { triple, namedNode } from '@rdfjs/data-model';
import { SingleResourceContainerMixin } from '@semapps/ldp';
import { ServiceSchema } from 'moleculer';

const RegistrySetServiceSchema = {
  name: 'registry-set' as const,
  mixins: [SingleResourceContainerMixin],

  settings: {
    acceptedTypes: ['interop:RegistrySet'],
    podProvider: true
  },

  hooks: {
    after: {
      async post(ctx: any, res: any) {
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
} satisfies ServiceSchema;

export default RegistrySetServiceSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [RegistrySetServiceSchema.name]: typeof RegistrySetServiceSchema;
    }
  }
}
