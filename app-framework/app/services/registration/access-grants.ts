import { ControlledContainerMixin, arrayOf } from '@semapps/ldp';
import { ServiceSchema, defineAction } from 'moleculer';

/**
 * Mirror container for access grants which have been granted to the app
 */
const AccessGrantsSchema = {
  name: 'access-grants' as const,
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:AccessGrant'],
    newResourcesPermissions: {}
  },
  actions: {
    deleteOrphans: defineAction({
      // Delete cached AccessGrants which are not linked anymore to an AccessNeedGroup (may happen on app upgrade)
      async handler(ctx) {
        const { podOwner } = ctx.params;

        const app = await ctx.call('app.get');

        const container = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#grantedBy': podOwner,
              'http://www.w3.org/ns/solid/interop#grantee': app.id
            }
          },
          { parentCtx: ctx }
        );

        for (const accessGrant of arrayOf(container?.['ldp:contains'])) {
          const accessNeedGroupExist = await ctx.call('access-needs-groups.exist', {
            resourceUri: accessGrant['interop:hasAccessNeedGroup'],
            webId: podOwner
          });
          if (!accessNeedGroupExist) {
            this.logger.info(
              `Deleting cached access grant ${accessGrant.id} as it is not linked anymore with an existing access need group...`
            );
            await this.actions.delete({ resourceUri: accessGrant.id, webId: podOwner });
          }
        }
      }
    })
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
