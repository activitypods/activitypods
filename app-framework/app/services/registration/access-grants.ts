import { ControlledContainerMixin, arrayOf } from '@semapps/ldp';
import { ServiceSchema } from 'moleculer';

/**
 * Mirror container for access grants which have been granted to the app
 */
const AccessGrantsSchema = {
  name: 'access-grants' as const,
  // @ts-expect-error TS(2322): Type '{ mixins: { settings: { path: null; accepted... Remove this comment to see the full error message
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/access-grants',
    types: ['interop:AccessGrant'],
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

    deleteOrphans: {
      // Delete cached grants which are not linked anymore to an access need (may happen on app upgrade)
      async handler(ctx: any) {
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

        for (const accessGrant of arrayOf(container['ldp:contains'])) {
          const accessNeedExist = await ctx.call('access-needs.exist', {
            resourceUri: accessGrant['interop:satisfiesAccessNeed'],
            webId: podOwner
          });
          if (!accessNeedExist) {
            this.logger.info(
              `Deleting cached access grant ${accessGrant.id} as it is not linked anymore with an existing access need...`
            );
            await this.actions.delete({ resourceUri: accessGrant.id, webId: podOwner }, { parentCtx: ctx });
          }
        }
      }
    }
  }
} satisfies ServiceSchema;

export default AccessGrantsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AccessGrantsSchema.name]: typeof AccessGrantsSchema;
    }
  }
}
