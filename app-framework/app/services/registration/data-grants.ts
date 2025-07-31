import { ControlledContainerMixin, arrayOf } from '@semapps/ldp';
import { ServiceSchema, defineAction } from 'moleculer';

/**
 * Mirror container for data grants which have been granted to the app
 */
const DataGrantsSchema = {
  name: 'data-grants' as const,
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:DataGrant'],
    newResourcesPermissions: {}
  },
  actions: {
    getContainerByShapeTree: defineAction({
      async handler(ctx) {
        const { shapeTreeUri, podOwner } = ctx.params;

        const app = await ctx.call('app.get');
        const containerUri = await this.actions.getContainerUri({ webId: podOwner }, { parentCtx: ctx });

        const filteredContainer = await this.actions.list(
          {
            containerUri,
            filters: {
              'http://www.w3.org/ns/solid/interop#registeredShapeTree': shapeTreeUri,
              'http://www.w3.org/ns/solid/interop#dataOwner': podOwner,
              'http://www.w3.org/ns/solid/interop#grantee': app.id
            },
            webId: 'system'
          },
          { parentCtx: ctx }
        );

        return filteredContainer['ldp:contains']?.[0]?.['interop:hasDataRegistration'];
      }
    }),

    deleteOrphans: defineAction({
      // Delete cached DataGrants which are not linked anymore to an AccessNeed (may happen on app upgrade)
      async handler(ctx) {
        const { podOwner } = ctx.params;

        const app = await ctx.call('app.get');

        const container = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#dataOwner': podOwner,
              'http://www.w3.org/ns/solid/interop#grantee': app.id
            }
          },
          { parentCtx: ctx }
        );

        for (const dataGrant of arrayOf(container?.['ldp:contains'])) {
          const accessNeedExist = await ctx.call('access-needs.exist', {
            resourceUri: dataGrant['interop:satisfiesAccessNeed'],
            webId: podOwner
          });
          if (!accessNeedExist) {
            this.logger.info(
              `Deleting cached data grant ${dataGrant.id} as it is not linked anymore with an existing access need...`
            );
            await this.actions.delete({ resourceUri: dataGrant.id, webId: podOwner });
          }
        }
      }
    })
  }
} satisfies ServiceSchema;

export default DataGrantsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [DataGrantsSchema.name]: typeof DataGrantsSchema;
    }
  }
}
