import { triple, namedNode } from '@rdfjs/data-model';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { SingleResourceContainerMixin } from '@semapps/ldp';

export default {
  name: 'auth-registry',
  mixins: [SingleResourceContainerMixin],
  settings: {
    acceptedTypes: ['interop:AuthorizationRegistry'],
    podProvider: true
  },
  dependencies: ['registry-set'],
  actions: {
    async add(ctx: any) {
      const { podOwner, accessAuthorizationUri } = ctx.params;

      // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ add(c... Remove this comment to see the full error message
      const authRegistryUri = await this.actions.getResourceUri({ webId: podOwner }, { parentCtx: ctx });

      // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ add(c... Remove this comment to see the full error message
      await this.actions.patch(
        {
          resourceUri: authRegistryUri,
          triplesToAdd: [
            triple(
              namedNode(authRegistryUri),
              namedNode('http://www.w3.org/ns/solid/interop#hasAccessAuthorization'),
              namedNode(accessAuthorizationUri)
            )
          ],
          webId: 'system'
        },
        { parentCtx: ctx }
      );
    },
    async remove(ctx: any) {
      const { podOwner, accessAuthorizationUri } = ctx.params;

      // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ add(c... Remove this comment to see the full error message
      const authRegistryUri = await this.actions.getResourceUri({ webId: podOwner }, { parentCtx: ctx });

      // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ add(c... Remove this comment to see the full error message
      await this.actions.patch(
        {
          resourceUri: authRegistryUri,
          triplesToRemove: [
            triple(
              namedNode(authRegistryUri),
              namedNode('http://www.w3.org/ns/solid/interop#hasAccessAuthorization'),
              namedNode(accessAuthorizationUri)
            )
          ],
          webId: 'system'
        },
        { parentCtx: ctx }
      );
    }
  },
  hooks: {
    after: {
      async post(ctx: any, res: any) {
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
