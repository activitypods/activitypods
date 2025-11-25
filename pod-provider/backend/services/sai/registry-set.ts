import rdf from '@rdfjs/data-model';
import { ControlledResourceMixin } from '@semapps/ldp';
import { ServiceSchema } from 'moleculer';

const RegistrySetService = {
  name: 'registry-set' as const,
  // @ts-expect-error TS(2322): Type '{ mixins: { settings: { path: null; accepted... Remove this comment to see the full error message
  mixins: [ControlledResourceMixin],
  settings: {
    path: '/registry-set',
    types: ['interop:RegistrySet']
  },
  events: {
    'webid.created': {
      async handler(ctx: any) {
        const { resourceUri: webId } = ctx.params;
        const registrySetUri = await this.actions.waitForCreation({}, { parentCtx: ctx });
        await ctx.call('ldp.resource.patch', {
          resourceUri: webId,
          triplesToAdd: [
            rdf.quad(
              rdf.namedNode(webId),
              rdf.namedNode('http://www.w3.org/ns/solid/interop#hasRegistrySet'),
              rdf.namedNode(registrySetUri)
            )
          ],
          webId: 'system'
        });
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
