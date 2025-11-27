import rdf from '@rdfjs/data-model';
import { ControlledResourceMixin } from '@semapps/ldp';
import { ServiceSchema } from 'moleculer';

const AuthRegistryService = {
  name: 'auth-registry' as const,
  // @ts-expect-error TS(2322): Type '{ mixins: { settings: { path: null; accepted... Remove this comment to see the full error message
  mixins: [ControlledResourceMixin],
  settings: {
    path: '/auth-registry',
    types: ['interop:AuthorizationRegistry'],
    typeIndex: 'private'
  },
  dependencies: ['registry-set'],
  actions: {
    add: {
      async handler(ctx: any) {
        const { authorizationUri } = ctx.params;

        const authRegistryUri = await this.actions.getUri({}, { parentCtx: ctx });

        await this.actions.patch(
          {
            resourceUri: authRegistryUri,
            triplesToAdd: [
              rdf.quad(
                rdf.namedNode(authRegistryUri),
                rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAccessAuthorization'),
                rdf.namedNode(authorizationUri)
              )
            ],
            webId: 'system'
          },
          { parentCtx: ctx }
        );
      }
    },

    remove: {
      async handler(ctx: any) {
        const { authorizationUri } = ctx.params;

        const authRegistryUri = await this.actions.getUri({}, { parentCtx: ctx });

        await this.actions.patch(
          {
            resourceUri: authRegistryUri,
            triplesToRemove: [
              rdf.quad(
                rdf.namedNode(authRegistryUri),
                rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAccessAuthorization'),
                rdf.namedNode(authorizationUri)
              )
            ],
            webId: 'system'
          },
          { parentCtx: ctx }
        );
      }
    }
  },
  events: {
    'registry-set.created': {
      async handler(ctx: any) {
        const { resourceUri: registrySetUri } = ctx.params;
        const authRegistryUri = await this.actions.waitForCreation({}, { parentCtx: ctx });
        await ctx.call('ldp.resource.patch', {
          resourceUri: registrySetUri,
          triplesToAdd: [
            rdf.quad(
              rdf.namedNode(registrySetUri),
              rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAuthorizationRegistry'),
              rdf.namedNode(authRegistryUri)
            )
          ],
          webId: 'system'
        });
      }
    }
  }
} satisfies ServiceSchema;

export default AuthRegistryService;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AuthRegistryService.name]: typeof AuthRegistryService;
    }
  }
}
