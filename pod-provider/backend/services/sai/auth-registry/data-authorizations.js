const { MoleculerError } = require('moleculer').Errors;
const { ControlledContainerMixin, arrayOf, getId } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { arraysEqual } = require('../../../utils');
const ImmutableContainerMixin = require('../../../mixins/immutable-container-mixin');

module.exports = {
  name: 'data-authorizations',
  mixins: [ImmutableContainerMixin, ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:DataAuthorization'],
    excludeFromMirror: true,
    activateTombstones: false,
    typeIndex: 'private'
  },
  actions: {
    /**
     * Generate a DataAuthorization based on a AccessNeed, unless it already exists
     */
    async generateFromAccessNeed(ctx) {
      const { accessNeedUri, podOwner, appUri } = ctx.params;

      // Check if a data authorization already exist for this access need
      const dataAuthorization = await this.actions.getByAccessNeed({ accessNeedUri, podOwner }, { parentCtx: ctx });

      if (dataAuthorization) {
        this.logger.info(`Found data authorization ${dataAuthorization.id} linked with access need ${accessNeedUri}`);
        return dataAuthorization.id;
      } else {
        const accessNeed = await ctx.call('ldp.remote.get', { resourceUri: accessNeedUri });

        const dataRegistrationUri = await ctx.call('data-registrations.generateFromShapeTree', {
          shapeTreeUri: accessNeed['interop:registeredShapeTree'],
          podOwner
        });

        const dataAuthorizationUri = await this.actions.post(
          {
            resource: {
              type: 'interop:DataAuthorization',
              'interop:dataOwner': podOwner,
              'interop:grantedBy': podOwner,
              'interop:grantee': appUri,
              'interop:registeredShapeTree': accessNeed['interop:registeredShapeTree'],
              'interop:hasDataRegistration': dataRegistrationUri,
              'interop:accessMode': accessNeed['interop:accessMode'],
              'interop:scopeOfAuthorization': 'interop:All',
              'interop:satisfiesAccessNeed': accessNeedUri
            },
            contentType: MIME_TYPES.JSON
          },
          { parentCtx: ctx }
        );

        return dataAuthorizationUri;
      }
    },
    async generateForSingleResource(ctx) {
      const { resourceUri, grantee, accessModes, delegationAllowed, delegationLimit, webId } = ctx.params;

      const dataRegistration = await ctx.call('data-registrations.getByResourceUri', { resourceUri, webId });
      const dataOwner = dataRegistration['interop:registeredBy'];

      // If the user is sharing a resource they don't own, ensure they have delegation right
      if (dataOwner !== webId) {
        const dataGrant = await ctx.call('data-grants.getByResourceUri', { resourceUri, webId });

        if (
          !dataGrant ||
          dataGrant['interop:delegationAllowed'] !== true ||
          (dataGrant['interop:delegationLimit'] && dataGrant['interop:delegationLimit'] < 1)
        ) {
          throw new MoleculerError('You are not allowed to share this resource', 403, 'FORBIDDEN');
        }
      }

      // Get existing data authorizations
      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#dataOwner': dataOwner,
            'http://www.w3.org/ns/solid/interop#grantee': grantee,
            'http://www.w3.org/ns/solid/interop#hasDataRegistration': getId(dataRegistration),
            'http://www.w3.org/ns/solid/interop#scopeOfAuthorization':
              'http://www.w3.org/ns/solid/interop#SelectedFromRegistry'
          },
          webId
        },
        { parentCtx: ctx }
      );
      const dataAuthorizations = arrayOf(filteredContainer['ldp:contains']);

      // Check if a data authorization was already created for this resource
      const dataAuthorizationForResource = dataAuthorizations.find(auth =>
        arrayOf(auth['interop:hasDataInstance']).includes(resourceUri)
      );

      if (dataAuthorizationForResource) {
        if (
          arraysEqual(dataAuthorizationForResource['interop:accessMode'], accessModes) &&
          delegationAllowed === dataAuthorizationForResource['interop:delegationAllowed'] &&
          delegationLimit === dataAuthorizationForResource['interop:delegationLimit']
        ) {
          // If the same access mode was granted for this resource, skip it
          this.logger.info(
            `Resource ${resourceUri} is already shared to ${grantee} with access modes ${accessModes.join(', ')}`
          );
          return getId(dataAuthorizationForResource);
        } else {
          // If the properties have changed, delete the authorization for this single resource
          await this.actions.deleteForSingleResource({ resourceUri, grantee, webId });
        }
      }

      // Check if a data authorization exist with the same access modes and delegation rights
      const dataAuthorizationForAccessModes = dataAuthorizations.find(
        auth =>
          arraysEqual(arrayOf(auth['interop:accessMode']), arrayOf(accessModes)) &&
          delegationAllowed === auth['interop:delegationAllowed'] &&
          delegationLimit === auth['interop:delegationLimit']
      );

      if (dataAuthorizationForAccessModes) {
        // If a data authorization exist with the same properties, add the resource
        const { resourceUri: newDataAuthorizationUri } = await this.actions.put(
          {
            resource: {
              ...dataAuthorizationForAccessModes,
              'interop:hasDataInstance': [
                ...arrayOf(dataAuthorizationForAccessModes['interop:hasDataInstance']),
                resourceUri
              ]
            },
            contentType: MIME_TYPES.JSON
          },
          { parentCtx: ctx }
        );
        return newDataAuthorizationUri;
      } else {
        const newDataAuthorizationUri = await this.actions.post(
          {
            resource: {
              type: 'interop:DataAuthorization',
              'interop:dataOwner': dataOwner,
              'interop:grantedBy': webId,
              'interop:grantee': grantee,
              'interop:registeredShapeTree': dataRegistration['interop:registeredShapeTree'],
              'interop:hasDataRegistration': getId(dataRegistration),
              'interop:hasDataInstance': resourceUri,
              'interop:accessMode': accessModes,
              'interop:scopeOfAuthorization': 'interop:SelectedFromRegistry',
              'interop:delegationAllowed': delegationAllowed,
              'interop:delegationLimit': delegationLimit
            },
            contentType: MIME_TYPES.JSON
          },
          { parentCtx: ctx }
        );

        return newDataAuthorizationUri;
      }
    },
    async deleteForSingleResource(ctx) {
      const { resourceUri, grantee, webId } = ctx.params;

      const dataRegistration = await ctx.call('data-registrations.getByResourceUri', { resourceUri, webId });
      const dataOwner = dataRegistration['interop:registeredBy'];

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#dataOwner': dataOwner,
            'http://www.w3.org/ns/solid/interop#grantee': grantee,
            'http://www.w3.org/ns/solid/interop#hasDataRegistration': getId(dataRegistration),
            'http://www.w3.org/ns/solid/interop#scopeOfAuthorization':
              'http://www.w3.org/ns/solid/interop#SelectedFromRegistry'
          },
          webId
        },
        { parentCtx: ctx }
      );

      for (const dataAuthorization of arrayOf(filteredContainer['ldp:contains'])) {
        const resourcesUris = arrayOf(dataAuthorization['interop:hasDataInstance']);
        if (resourcesUris.includes(resourceUri)) {
          if (resourcesUris.length === 1) {
            // If the resource is the only one in the data authorization, delete it
            await this.actions.delete(
              {
                resourceUri: getId(dataAuthorization),
                webId: 'system'
              },
              { parentCtx: ctx }
            );
          } else {
            // If other resources are in the data authorization, remove it
            await this.actions.put(
              {
                resource: {
                  ...dataAuthorization,
                  'interop:hasDataInstance': resourcesUris.filter(uri => uri !== resourceUri)
                },
                contentType: MIME_TYPES.JSON,
                webId: 'system'
              },
              { parentCtx: ctx }
            );
          }
        }
      }
    },
    async listForSingleResource(ctx) {
      const { resourceUri } = ctx.params;
      const webId = ctx.params.webId || ctx.meta.webId;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#hasDataInstance': resourceUri,
            'http://www.w3.org/ns/solid/interop#scopeOfAuthorization':
              'http://www.w3.org/ns/solid/interop#SelectedFromRegistry'
          },
          webId
        },
        { parentCtx: ctx }
      );

      return arrayOf(filteredContainer['ldp:contains']);
    },
    // Get the DataAuthorization linked with an AccessNeed
    async getByAccessNeed(ctx) {
      const { accessNeedUri, podOwner } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#satisfiesAccessNeed': accessNeedUri,
            'http://www.w3.org/ns/solid/interop#dataOwner': podOwner
          },
          webId: podOwner
        },
        { parentCtx: ctx }
      );

      return arrayOf(filteredContainer['ldp:contains'])[0];
    },
    // Get all the DataAuthorizations granted to an agent
    async listByGrantee(ctx) {
      const { grantee, webId } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#grantee': grantee
          },
          webId
        },
        { parentCtx: ctx }
      );

      return arrayOf(filteredContainer['ldp:contains']);
    },
    // List all data authorizations with `interop:All` scope
    // An optional shapeTreeUri param can be passed to filter by shape tree
    async listScopeAll(ctx) {
      const { podOwner, shapeTreeUri } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#scopeOfAuthorization': 'http://www.w3.org/ns/solid/interop#All',
            'http://www.w3.org/ns/solid/interop#registeredShapeTree': shapeTreeUri
          },
          webId: podOwner
        },
        { parentCtx: ctx }
      );

      return arrayOf(filteredContainer['ldp:contains']);
    },
    // Delete DataAuthorizations which are not linked anymore to an AccessNeed (may happen on app upgrade)
    async deleteOrphans(ctx) {
      const { appUri, podOwner } = ctx.params;
      const dataAuthorizations = await this.actions.listByGrantee(
        { grantee: appUri, webId: podOwner },
        { parentCtx: ctx }
      );
      for (const dataAuthorization of dataAuthorizations) {
        try {
          await ctx.call('ldp.remote.get', { resourceUri: dataAuthorization['interop:satisfiesAccessNeed'] });
        } catch (e) {
          if (e.code === 404) {
            this.logger.info(
              `Deleting data authorization ${dataAuthorization.id} as it is not linked anymore with an existing access need...`
            );
            await this.actions.delete({ resourceUri: dataAuthorization.id, webId: podOwner });
          } else {
            throw e;
          }
        }
      }
    }
  },
  hooks: {
    after: {
      async create(ctx, res) {
        // For migration, we don't want to handle the following side-effects
        if (ctx.meta.isMigration === true) return;

        const dataAuthorization = res.newData;
        const dataOwner = dataAuthorization['interop:dataOwner'];
        const scope = dataAuthorization['interop:scopeOfAuthorization'];
        const webId = ctx.params.webId || ctx.meta.webId;

        // Check if we need to generate a data grant or a delegated data grant
        if (dataOwner === webId) {
          await ctx.call('data-grants.generateFromDataAuthorization', {
            dataAuthorization
          });
        } else {
          await ctx.call('delegated-data-grants.generateFromDataAuthorization', {
            dataAuthorization
          });
        }

        if (scope === 'interop:All') {
          // Generate delegated data grants for all shared resources with the same shape tree
          const dataGrants = await ctx.call('social-agent-registrations.getSharedDataGrants', { podOwner: dataOwner });
          for (const dataGrant of dataGrants) {
            if (dataGrant['interop:registeredShapeTree'] === dataAuthorization['interop:registeredShapeTree']) {
              await ctx.call('delegated-data-grants.generateFromSingleScopeAllDataAuthorization', {
                dataAuthorization,
                dataGrant
              });
            }
          }
        }

        return res;
      },
      async delete(ctx, res) {
        const dataAuthorization = res.oldData;

        // Delete data grant that match the same access need
        const dataGrant = await ctx.call('data-grants.getByAccessNeed', {
          accessNeedUri: dataAuthorization['interop:satisfiesAccessNeed'],
          podOwner: dataAuthorization['interop:dataOwner']
        });

        if (dataGrant) {
          await ctx.call('data-grants.delete', {
            resourceUri: dataGrant.id,
            webId: 'system'
          });
        }

        return res;
      }
    }
  }
};
