import { triple, namedNode } from '@rdfjs/data-model';
import { SingleResourceContainerMixin } from '@semapps/ldp';
import { ServiceSchema } from 'moleculer';

const AuthRegistrySchema = {
  name: 'auth-registry' as const,
  // @ts-expect-error TS(2322): Type '{ mixins: { settings: { path: null; accepted... Remove this comment to see the full error message
  mixins: [SingleResourceContainerMixin],
  settings: {
    acceptedTypes: ['interop:AuthorizationRegistry'],
    podProvider: true
  },
  dependencies: ['registry-set'],
  actions: {
    add: {
      async handler(ctx) {
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
      }
    },

    remove: {
      async handler(ctx) {
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
} satisfies ServiceSchema;

export default AuthRegistrySchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AuthRegistrySchema.name]: typeof AuthRegistrySchema;
    }
  }
}
