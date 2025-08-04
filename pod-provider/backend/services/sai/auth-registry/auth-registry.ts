import { triple, namedNode } from '@rdfjs/data-model';
import { SingleResourceContainerMixin } from '@semapps/ldp';

const AuthRegistrySchema = {
  name: 'auth-registry',
  mixins: [SingleResourceContainerMixin],
  settings: {
    acceptedTypes: ['interop:AuthorizationRegistry'],
    podProvider: true
  },
  dependencies: ['registry-set'],
  actions: {
    async add(ctx) {
      const { podOwner, authorizationUri } = ctx.params;

      const authRegistryUri = await this.actions.getResourceUri({ webId: podOwner }, { parentCtx: ctx });

      await this.actions.patch(
        {
          resourceUri: authRegistryUri,
          triplesToAdd: [
            triple(
              namedNode(authRegistryUri),
              namedNode('http://www.w3.org/ns/solid/interop#hasAccessAuthorization'),
              namedNode(authorizationUri)
            )
          ],
          webId: 'system'
        },
        { parentCtx: ctx }
      );
    },
    async remove(ctx) {
      const { podOwner, authorizationUri } = ctx.params;

      const authRegistryUri = await this.actions.getResourceUri({ webId: podOwner }, { parentCtx: ctx });

      await this.actions.patch(
        {
          resourceUri: authRegistryUri,
          triplesToRemove: [
            triple(
              namedNode(authRegistryUri),
              namedNode('http://www.w3.org/ns/solid/interop#hasAccessAuthorization'),
              namedNode(authorizationUri)
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
      async post(ctx, res) {
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

export default AuthRegistrySchema;
