import { ServiceSchema } from 'moleculer';
import { ControlledContainerMixin, arrayOf } from '@semapps/ldp';

/**
 * Mirror container for data grants which have been granted to the app
 */
const DataGrantsService = {
  name: 'data-grants' as const,
  // @ts-expect-error TS(2322): Type '{ mixins: { settings: { path: null; accepted... Remove this comment to see the full error message
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/data-grants',
    types: ['interop:DataGrant'],
    newResourcesPermissions: {}
  },
  actions: {
    getContainerByShapeTree: {
      async handler(ctx: any) {
        const { shapeTreeUri, podOwner } = ctx.params;

        const appUri = await ctx.call('app.getUri');
        const containerUri = await this.actions.getContainerUri({}, { parentCtx: ctx });

        const filteredContainer = await this.actions.list(
          {
            containerUri,
            filters: {
              'http://www.w3.org/ns/solid/interop#registeredShapeTree': shapeTreeUri,
              'http://www.w3.org/ns/solid/interop#dataOwner': podOwner,
              'http://www.w3.org/ns/solid/interop#grantee': appUri
            },
            webId: 'system'
          },
          { parentCtx: ctx }
        );

        return filteredContainer['ldp:contains']?.[0]?.['interop:hasDataRegistration'];
      }
    },
    // Delete cached DataGrants which are not linked anymore to an AccessNeed (may happen on app upgrade)
    deleteOrphans: {
      async handler(ctx) {
        const { podOwner } = ctx.params;

        const appUri = await ctx.call('app.getUri');

        const container = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#dataOwner': podOwner,
              'http://www.w3.org/ns/solid/interop#grantee': appUri
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
            await this.actions.delete({ resourceUri: dataGrant.id, webId: podOwner }, { parentCtx: ctx });
          }
        }
      }
    }
  }
} satisfies ServiceSchema;

export default DataGrantsService;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [DataGrantsService.name]: typeof DataGrantsService;
    }
  }
}
