import { triple, namedNode } from '@rdfjs/data-model';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
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
