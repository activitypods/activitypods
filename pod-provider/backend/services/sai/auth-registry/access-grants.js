const { ControlledContainerMixin, arrayOf, getId } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const ImmutableContainerMixin = require('../../../mixins/immutable-container-mixin');
const { arraysEqual } = require('../../../utils');

module.exports = {
  name: 'access-grants',
  mixins: [ImmutableContainerMixin, ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:AccessGrant'],
    newResourcesPermissions: {
      anon: {
        read: true
      }
    },
    excludeFromMirror: true,
    activateTombstones: false,
    typeIndex: 'private'
  },
  actions: {
    async generateFromAccessAuthorization(ctx) {
      const { accessAuthorization, podOwner } = ctx.params;

      // Get data grants and delegated data grants corresponding to data authorizations
      let dataGrantsUris = [];
      for (const dataAuthorizationUri of arrayOf(accessAuthorization['interop:hasDataAuthorization'])) {
        const dataAuthorization = await ctx.call('data-authorizations.get', {
          resourceUri: dataAuthorizationUri,
          webId: podOwner
        });
        if (dataAuthorization['interop:dataOwner'] === podOwner) {
          dataGrantsUris.push(await ctx.call('data-grants.getByDataAuthorization', { dataAuthorization }));
        } else {
          dataGrantsUris.push(await ctx.call('delegated-data-grants.getByDataAuthorization', { dataAuthorization }));
        }
        if (dataAuthorization['interop:scopeOfAuthorization'] === 'interop:All') {
          dataGrantsUris.push(
            ...(await ctx.call('delegated-data-grants.listByDataAuthorization', { dataAuthorization }))
          );
        }
      }

      const accessGrant = await this.actions.getByAccessAuthorization({ accessAuthorization }, { parentCtx: ctx });

      if (accessGrant) {
        if (!arraysEqual(accessGrant['interop:hasDataGrant'], dataGrantsUris)) {
          // If the data grants URIs have changed, update (regenerate) the access grant
          const { resourceUri: accessGrantUri } = await this.actions.put(
            {
              resource: {
                ...accessGrant,
                'interop:hasDataGrant': dataGrantsUris
              },
              contentType: MIME_TYPES.JSON,
              webId: podOwner
            },
            { parentCtx: ctx }
          );

          return accessGrantUri;
        } else {
          return getId(accessGrant);
        }
      } else {
        // Create a AccessGrant with the same data, except interop:grantedWith and interop:hasDataAuthorization
        const accessGrantUri = await this.actions.post(
          {
            resource: {
              ...accessAuthorization,
              id: undefined,
              type: 'interop:AccessGrant',
              'interop:grantedWith': undefined,
              'interop:hasDataAuthorization': undefined,
              'interop:hasDataGrant': dataGrantsUris
            },
            contentType: MIME_TYPES.JSON,
            webId: podOwner
          },
          { parentCtx: ctx }
        );

        return accessGrantUri;
      }
    },
    // Get all the AccessGrants granted to an agent
    async getForAgent(ctx) {
      const { agentUri, podOwner } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#grantedBy': podOwner,
            'http://www.w3.org/ns/solid/interop#grantee': agentUri
          },
          webId: podOwner
        },
        { parentCtx: ctx }
      );

      return arrayOf(filteredContainer['ldp:contains']);
    },
    // Get the AccessGrant linked with an AccessNeedGroup
    async getByAccessNeedGroup(ctx) {
      const { accessNeedGroupUri, podOwner } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#grantedBy': podOwner,
            'http://www.w3.org/ns/solid/interop#hasAccessNeedGroup': accessNeedGroupUri
          },
          webId: podOwner
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0];
    },
    async getByAccessAuthorization(ctx) {
      const { accessAuthorization } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#grantedBy': accessAuthorization['interop:grantedBy'],
            'http://www.w3.org/ns/solid/interop#grantee': accessAuthorization['interop:grantee'],
            'http://www.w3.org/ns/solid/interop#hasAccessNeedGroup': accessAuthorization['interop:hasAccessNeedGroup']
          },
          webId: accessAuthorization['interop:grantedBy']
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0];
    }
  }
};
