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
    async getContainerByShapeTree(ctx) {
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
    },
    // Delete cached grants which are not linked anymore to an access need (may happen on app upgrade)
    async deleteOrphans(ctx) {
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

      for (const accessGrant of arrayOf(container['ldp:contains'])) {
        const accessNeedExist = await ctx.call('access-needs.exist', {
          resourceUri: accessGrant['interop:satisfiesAccessNeed'],
          webId: podOwner
        });
        if (!accessNeedExist) {
          this.logger.info(
            `Deleting cached access grant ${accessGrant.id} as it is not linked anymore with an existing access need...`
          );
          await this.actions.delete({ resourceUri: accessGrant.id, webId: podOwner });
        }
      }
    }
  }
};
