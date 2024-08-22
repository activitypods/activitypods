const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');

/**
 * Mirror container for access grants which have been granted to the app
 */
module.exports = {
  name: 'access-grants',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:AccessGrant'],
    newResourcesPermissions: {}
  },
  actions: {
    // Delete cached AccessGrants which are not linked anymore to an AccessNeedGroup (may happen on app upgrade)
    async deleteOrphans(ctx) {
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
  }
};
