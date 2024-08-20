const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');

/**
 * Mirror container for data grants which have been granted to the app
 */
module.exports = {
  name: 'data-grants',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:DataGrant'],
    newResourcesPermissions: {}
  },
  actions: {
    async getContainerByType(ctx) {
      const { type, podOwner } = ctx.params;

      const app = await ctx.call('app.get');
      const containerUri = await this.actions.getContainerUri({ webId: podOwner }, { parentCtx: ctx });
      const [fullTypeUri] = await ctx.call('jsonld.parser.expandTypes', { types: [type] });

      const filteredContainer = await this.actions.list(
        {
          containerUri,
          filters: {
            'http://activitypods.org/ns/core#registeredClass': fullTypeUri,
            'http://www.w3.org/ns/solid/interop#dataOwner': podOwner,
            'http://www.w3.org/ns/solid/interop#grantee': app.id
          },
          webId: 'system'
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0]?.['apods:registeredContainer'];
    },
    // Delete cached DataGrants which are not linked anymore to an AccessNeed (may happen on app upgrade)
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
  }
};
