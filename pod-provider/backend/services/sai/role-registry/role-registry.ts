import rdf from '@rdfjs/data-model';
import { SingleResourceContainerMixin } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';
import { ServiceSchema } from 'moleculer';

const RoleRegistrySchema = {
  name: 'role-registry' as const,
  // @ts-expect-error TS(2322): Type '{ mixins: { settings: { path: null; accepted... Remove this comment to see the full error message
  mixins: [SingleResourceContainerMixin],
  settings: {
    acceptedTypes: ['interop:RoleRegistry'],
    podProvider: true
  },
  dependencies: ['registry-set'],
  actions: {
    initializeResource: {
      // Only groups have a role registry
      async handler(ctx) {
        const { webId } = ctx.params;

        const account = await ctx.call('auth.account.findByWebId', { webId });
        if (!account?.group) return;

        const containerUri = await this.actions.getContainerUri({ webId }, { parentCtx: ctx });
        await this.actions.waitForContainerCreation({ containerUri }, { parentCtx: ctx });

        return await this.actions.post(
          { containerUri, resource: { type: 'interop:RoleRegistry' }, contentType: MIME_TYPES.JSON, webId },
          { parentCtx: ctx }
        );
      }
    },

    add: {
      async handler(ctx) {
        const { podOwner, roleRegistrationUri } = ctx.params;

        const roleRegistryUri = await this.actions.waitForResourceCreation({ webId: podOwner }, { parentCtx: ctx });

        await this.actions.patch(
          {
            resourceUri: roleRegistryUri,
            triplesToAdd: [
              rdf.quad(
                rdf.namedNode(roleRegistryUri),
                rdf.namedNode('http://www.w3.org/ns/solid/interop#hasRoleRegistration'),
                rdf.namedNode(roleRegistrationUri)
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
        const { podOwner, roleRegistrationUri } = ctx.params;

        const roleRegistryUri = await this.actions.getResourceUri({ webId: podOwner }, { parentCtx: ctx });

        await this.actions.patch(
          {
            resourceUri: roleRegistryUri,
            triplesToRemove: [
              rdf.quad(
                rdf.namedNode(roleRegistryUri),
                rdf.namedNode('http://www.w3.org/ns/solid/interop#hasRoleRegistration'),
                rdf.namedNode(roleRegistrationUri)
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
        const registrySetUri = await ctx.call('registry-set.waitForResourceCreation', { webId: ctx.params.webId });
        await ctx.call('registry-set.patch', {
          resourceUri: registrySetUri,
          triplesToAdd: [
            rdf.quad(
              rdf.namedNode(registrySetUri),
              rdf.namedNode('http://www.w3.org/ns/solid/interop#hasRoleRegistry'),
              rdf.namedNode(res)
            )
          ],
          webId: 'system'
        });
        return res;
      }
    }
  }
} satisfies ServiceSchema;

export default RoleRegistrySchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [RoleRegistrySchema.name]: typeof RoleRegistrySchema;
    }
  }
}
