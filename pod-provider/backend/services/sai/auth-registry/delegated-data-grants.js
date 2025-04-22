const { ControlledContainerMixin, arrayOf, getId } = require('@semapps/ldp');
const ImmutableContainerMixin = require('../../../mixins/immutable-container-mixin');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'delegated-data-grants',
  mixins: [ImmutableContainerMixin, ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:DelegatedDataGrant'],
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
    async generateForAgent(ctx) {
      const { agentUri, dataGrant } = ctx.params;

      const delegatedGrantUri = await this.actions.post(
        {
          resource: {
            ...dataGrant,
            id: undefined,
            type: 'interop:DelegatedDataGrant',
            'interop:grantee': agentUri,
            'interop:delegationOfGrant': getId(dataGrant)
          },
          contentType: MIME_TYPES.JSON
        },
        { parentCtx: ctx }
      );

      return delegatedGrantUri;
    },
    // Generate a delegated data grants from a data authorization with `interop:All` scope
    // If a delegated data grant already exist but is linked to a different data grant, it will be deleted
    async generateForDataAuthorization(ctx) {
      const { dataAuthorization, dataGrant } = ctx.params;

      if (dataAuthorization['interop:scopeOfAuthorization'] !== 'interop:All') {
        throw new Error(
          `The scope of data authorization ${dataAuthorization.id} must be 'interop:All' (Received: ${dataAuthorization['interop:scopeOfAuthorization']})`
        );
      }

      if (dataAuthorization['interop:registeredShapeTree'] !== dataGrant['interop:registeredShapeTree']) {
        throw new Error(
          `The shape tree of the data authorization (${dataAuthorization['interop:registeredShapeTree']}) is not the same as the one of the data grant (${dataGrant['interop:registeredShapeTree']})`
        );
      }

      // Get all delegated data grants generated from this data authorization
      const delegatedDataGrants = await ctx.call('delegated-data-grants.listByDataAuthorization', {
        dataAuthorization
      });

      // Find if a delegated data grant already exist for this social agent
      const delegatedDataGrant = delegatedDataGrants.find(
        ddg => ddg['interop:dataOwner'] === dataGrant['interop:dataOwner']
      );

      if (delegatedDataGrant) {
        if (delegatedDataGrant['interop:delegationOfGrant'] === dataGrant.id) {
          this.logger.info(
            `Data grant ${dataGrant.id} has not changed, skipping generation of delegated data grant...`
          );
        } else {
          this.logger.info(`Data grant ${dataGrant.id} has been updated, regenerating the delegated data grant...`);

          await this.actions.put(
            {
              resource: {
                ...delegatedDataGrant,
                'interop:delegationOfGrant': getId(dataGrant.id)
              },
              contentType: MIME_TYPES.JSON,
              webId: dataAuthorization['interop:dataOwner']
            },
            { parentCtx: ctx }
          );
        }
      } else {
        this.logger.info(`Data grant ${dataGrant.id} has no associated delegated data grant, generating...`);

        await this.actions.post(
          {
            resource: {
              ...dataGrant,
              id: undefined,
              type: 'interop:DelegatedDataGrant',
              'interop:grantee': dataAuthorization['interop:grantee'],
              'interop:satisfiesAccessNeed': dataAuthorization['interop:satisfiesAccessNeed'],
              'interop:delegationOfGrant': getId(dataGrant.id)
            },
            contentType: MIME_TYPES.JSON,
            webId: dataAuthorization['interop:dataOwner']
          },
          { parentCtx: ctx }
        );
      }
    },
    // Get the DelegatedDataGrant linked with an DataGrant
    async getByDataGrant(ctx) {
      const { dataGrantUri, grantee, podOwner } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#delegationOfGrant': dataGrantUri,
            'http://www.w3.org/ns/solid/interop#grantee': grantee
          },
          webId: podOwner
        },
        { parentCtx: ctx }
      );

      return arrayOf(filteredContainer['ldp:contains'])[0];
    },
    // Get the delegated data grants generated automatically from a `interop:All` data authorization
    async listByDataAuthorization(ctx) {
      const { dataAuthorization } = ctx.params;

      if (dataAuthorization['interop:scopeOfAuthorization'] !== 'interop:All') {
        throw new Error(
          `The scope of data authorization ${dataAuthorization.id} must be 'interop:All' (Received: ${dataAuthorization['interop:scopeOfAuthorization']})`
        );
      }

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#registeredShapeTree': dataAuthorization['interop:registeredShapeTree'],
            'http://www.w3.org/ns/solid/interop#satisfiesAccessNeed': dataAuthorization['interop:satisfiesAccessNeed'],
            'http://www.w3.org/ns/solid/interop#grantee': dataAuthorization['interop:grantee']
          },
          webId: dataAuthorization['interop:dataOwner']
        },
        { parentCtx: ctx }
      );

      return arrayOf(filteredContainer['ldp:contains']);
    }
    // Get the delegated data grant generated automatically from a `interop:All` data authorization, for a given data owner
    // async getByDataAuthorizationAndDataOwner(ctx) {
    //   const { dataAuthorization, dataOwner } = ctx.params;

    //   const filteredContainer = await this.actions.list(
    //     {
    //       filters: {
    //         'http://www.w3.org/ns/solid/interop#dataOwner': dataOwner,
    //         'http://www.w3.org/ns/solid/interop#registeredShapeTree': dataAuthorization['interop:registeredShapeTree'],
    //         'http://www.w3.org/ns/solid/interop#satisfiesAccessNeed': dataAuthorization['interop:satisfiesAccessNeed'],
    //         'http://www.w3.org/ns/solid/interop#grantee': dataAuthorization['interop:grantee']
    //       },
    //       webId: dataAuthorization['interop:dataOwner']
    //     },
    //     { parentCtx: ctx }
    //   );

    //   return filteredContainer['ldp:contains']?.[0];
    // }
  }
};
