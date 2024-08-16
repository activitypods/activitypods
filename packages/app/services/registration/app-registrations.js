const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');

/**
 * Mirror container for application registrations
 */
module.exports = {
  name: 'app-registrations',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:ApplicationRegistration'],
    newResourcesPermissions: {}
  },
  actions: {
    async getForActor(ctx) {
      const { actorUri } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#registeredBy': actorUri
          },
          webId: 'system'
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0];
    },
    async getRegisteredPods(ctx) {
      const filteredContainer = await this.actions.list({ webId: 'system' }, { parentCtx: ctx });

      return filteredContainer['ldp:contains']?.map(appRegistration => appRegistration['interop:registeredBy']);
    }
  },
  hooks: {
    after: {
      async delete(ctx, res) {
        const appRegistration = res.oldData;

        // DELETE ALL RELATED GRANTS

        for (const accessGrantUri of arrayOf(appRegistration['interop:hasAccessGrant'])) {
          const accessGrant = await ctx.call('access-grants.get', {
            resourceUri: accessGrantUri,
            webId: 'system'
          });

          for (const dataGrantUri of arrayOf(accessGrant['interop:hasDataGrant'])) {
            await ctx.call('data-grants.delete', {
              resourceUri: dataGrantUri,
              webId: 'system'
            });
          }

          await ctx.call('access-grants.delete', {
            resourceUri: accessGrantUri,
            webId: 'system'
          });
        }

        return res;
      }
    }
  }
};
