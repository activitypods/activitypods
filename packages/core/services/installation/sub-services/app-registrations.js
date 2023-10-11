const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const interopContext = require('../../../config/context-interop.json');

module.exports = {
  name: 'app-registrations',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/app-registrations',
    acceptedTypes: ['interop:ApplicationRegistration'],
    newResourcesPermissions: {
      anon: {
        read: true
      }
    }
  },
  actions: {
    async getForApp(ctx) {
      const { appUri } = ctx.params;

      let filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#registeredAgent': appUri
          },
          jsonContext: interopContext,
          accept: MIME_TYPES.JSON,
          webId: 'system'
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0];
    }
  },
  hooks: {
    before: {
      async delete(ctx) {
        const { resourceUri, webId } = ctx.params;

        const appRegistration = await ctx.call('ldp.resource.get', {
          resourceUri,
          jsonContext: interopContext,
          accept: MIME_TYPES.JSON,
          webId
        });

        // DELETE ALL RELATED GRANTS

        for (const accessGrantUri of arrayOf(appRegistration['interop:hasAccessGrant'])) {
          const accessGrant = await ctx.call('ldp.resource.get', {
            resourceUri: accessGrantUri,
            jsonContext: interopContext,
            accept: MIME_TYPES.JSON,
            webId
          });

          for (const dataGrantUri of arrayOf(accessGrant['interop:hasDataGrant'])) {
            await ctx.call('ldp.resource.delete', {
              resourceUri: dataGrantUri,
              webId
            });
          }

          await ctx.call('ldp.resource.delete', {
            resourceUri: accessGrantUri,
            webId
          });
        }
      }
    }
  }
};
