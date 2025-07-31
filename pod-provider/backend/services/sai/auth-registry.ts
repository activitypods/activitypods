import { triple, namedNode } from '@rdfjs/data-model';
import { SingleResourceContainerMixin } from '@semapps/ldp';
import { ServiceSchema, defineAction } from 'moleculer';

const AuthRegistryServiceSchema = {
  name: 'auth-registry' as const,
  mixins: [SingleResourceContainerMixin],

  settings: {
    acceptedTypes: ['interop:AuthorizationRegistry'],
    podProvider: true
  },

  dependencies: ['registry-set'],

  actions: {
    add: defineAction({
      async handler(ctx: any) {
        const { podOwner, accessAuthorizationUri } = ctx.params;

        const authRegistryUri = await this.actions.getResourceUri({ webId: podOwner }, { parentCtx: ctx });

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
      }
    }),

    remove: defineAction({
      async handler(ctx: any) {
        const { podOwner, accessAuthorizationUri } = ctx.params;

        const authRegistryUri = await this.actions.getResourceUri({ webId: podOwner }, { parentCtx: ctx });

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
    })
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
} satisfies ServiceSchema;

export default AuthRegistryServiceSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AuthRegistryServiceSchema.name]: typeof AuthRegistryServiceSchema;
    }
  }
}
