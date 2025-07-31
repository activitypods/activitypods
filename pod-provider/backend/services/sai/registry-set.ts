import { triple, namedNode } from '@rdfjs/data-model';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { SingleResourceContainerMixin } from '@semapps/ldp';

export default {
  name: 'registry-set',
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
};
