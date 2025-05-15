const { ControlledContainerMixin, arrayOf, getId, getDatasetFromUri } = require('@semapps/ldp');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const ImmutableContainerMixin = require('../../../mixins/immutable-container-mixin');
const DataGrantsMixin = require('../../../mixins/data-grants');

module.exports = {
  name: 'delegated-data-grants',
  mixins: [ImmutableContainerMixin, ControlledContainerMixin, DataGrantsMixin],
  settings: {
    acceptedTypes: ['interop:DelegatedDataGrant'],
    excludeFromMirror: true,
    activateTombstones: false,
    typeIndex: 'private'
  },
  actions: {
    // If the delegated data grant posted should be created on the data owner's storage
    // then do that and keep it in cache. Otherwise create it locally as usual.
    async post(ctx) {
      const { resource: delegatedDataGrant } = ctx.params;
      const webId = ctx.params.webId || ctx.meta.webId || 'anon';

      if (delegatedDataGrant['interop:dataOwner'] !== webId) {
        const delegatedDataGrantUri = await ctx.call('delegation-issuer.remoteIssue', { delegatedDataGrant, webId });

        // Now the delegated data grant has been created and validated, store it locally
        await ctx.call('ldp.remote.store', { resourceUri: delegatedDataGrantUri, webId });
        await this.actions.attach({ resourceUri: delegatedDataGrantUri, webId }, { parentCtx: ctx });

        return delegatedDataGrantUri;
      } else {
        if (!ctx.params.containerUri) {
          ctx.params.containerUri = await this.actions.getContainerUri({ webId: ctx.params.webId }, { parentCtx: ctx });
        }

        return await ctx.call('ldp.container.post', ctx.params);
      }
    },
    // async delete(ctx) {
    //   const { resourceUri } = ctx.params;
    //   const webId = ctx.params.webId || ctx.meta.webId || 'anon';

    //   const delegatedDataGrant = await this.actions.get({ resourceUri, webId }, { parentCtx: ctx });

    //   if (delegatedDataGrant['interop:dataOwner'] !== webId) {
    //     await ctx.call('delegation-issuer.remoteDelete', { delegatedDataGrant, webId });

    //     // Now the delegated data grant has been delete, delete the local cache
    //     await ctx.call('ldp.remote.delete', { resourceUri, webId });
    //     const containerUri = await this.actions.getContainerUri({ webId }, { parentCtx: ctx });
    //     await this.actions.detach({ resourceUri, containerUri, webId }, { parentCtx: ctx });

    //     return {
    //       resourceUri,
    //       containersUris: [containerUri],
    //       oldData: delegatedDataGrant,
    //       webId,
    //       dataset: ctx.meta.dataset
    //     };
    //   } else {
    //     return await ctx.call('ldp.resource.delete', ctx.params);
    //   }
    // },
    // Generate the delegated data grants from all data authorizations with `interop:All` scope
    // Return the list of grantees, so that their registrations eventually may be regenerated
    async generateFromAllScopeAllDataAuthorizations(ctx) {
      const { dataGrant, podOwner } = ctx.params;
      let grantees = [];

      const dataAuthorizations = await ctx.call('data-authorizations.listScopeAll', {
        podOwner,
        shapeTreeUri: dataGrant['interop:registeredShapeTree']
      });

      for (const dataAuthorization of dataAuthorizations) {
        await ctx.call('delegated-data-grants.generateFromSingleScopeAllDataAuthorization', {
          dataAuthorization,
          dataGrant
        });

        // Find the access authorization that is linking the data authorization
        const accessAuthorization = await ctx.call('access-authorizations.getByDataAuthorization', {
          dataAuthorizationUri: getId(dataAuthorization),
          podOwner
        });

        // Regenerate the access grant based on the access authorization
        await ctx.call('access-grants.generateFromAccessAuthorization', {
          accessAuthorization,
          podOwner
        });

        if (!grantees.includes(dataAuthorization['interop:grantee']))
          grantees.push(dataAuthorization['interop:grantee']);
      }

      return grantees;
    },
    // Generate a delegated data grant from a single data authorization with `interop:All` scope
    // If a delegated data grant already exist but is linked to a different data grant, it will be deleted
    async generateFromSingleScopeAllDataAuthorization(ctx) {
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
                'interop:hasDataInstance': dataGrant['interop:hasDataInstance'],
                'interop:delegationOfGrant': getId(dataGrant)
              },
              contentType: MIME_TYPES.JSON
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
              'interop:grantedBy': dataAuthorization['interop:grantedBy'],
              'interop:satisfiesAccessNeed': dataAuthorization['interop:satisfiesAccessNeed'],
              'interop:delegationOfGrant': getId(dataGrant)
            },
            contentType: MIME_TYPES.JSON
          },
          { parentCtx: ctx }
        );
      }
    },
    async generateFromDataAuthorization(ctx) {
      const { dataAuthorization } = ctx.params;
      const webId = ctx.params.webId || ctx.meta.webId;

      // Find original data grant (it should be stored in the user's local cache)
      const dataGrantsContainer = await ctx.call('data-grants.list', {
        filters: {
          'http://www.w3.org/ns/solid/interop#satisfiesAccessNeed': dataAuthorization['interop:satisfiesAccessNeed'],
          'http://www.w3.org/ns/solid/interop#dataOwner': dataAuthorization['interop:dataOwner'],
          'http://www.w3.org/ns/solid/interop#hasDataRegistration': dataAuthorization['interop:hasDataRegistration']
        },
        webId
      });
      const dataGrant = dataGrantsContainer['ldp:contains']?.[0];

      const delegationAllowed =
        dataGrant['interop:delegationAllowed'] &&
        (dataGrant['interop:delegationLimit'] === undefined || dataGrant['interop:delegationLimit'] > 1);

      const delegatedDataGrantUri = await this.actions.post(
        {
          resource: {
            ...dataGrant,
            id: undefined,
            type: 'interop:DelegatedDataGrant',
            'interop:grantee': dataAuthorization['interop:grantee'],
            'interop:grantedBy': webId,
            'interop:delegationOfGrant': getId(dataGrant),
            'interop:delegationAllowed': delegationAllowed ? true : undefined,
            'interop:delegationLimit':
              delegationAllowed && dataGrant['interop:delegationLimit']
                ? dataGrant['interop:delegationLimit'] - 1
                : undefined
          },
          contentType: MIME_TYPES.JSON
        },
        { parentCtx: ctx }
      );

      // Notify the grantee of the delegated data grant, so that they may put it in cache
      const outboxUri = await ctx.call('activitypub.actor.getCollectionUri', {
        actorUri: webId,
        predicate: 'outbox'
      });
      await ctx.call('activitypub.outbox.post', {
        collectionUri: outboxUri,
        type: ACTIVITY_TYPES.CREATE,
        object: delegatedDataGrantUri,
        to: dataAuthorization['interop:grantee']
      });

      return delegatedDataGrantUri;
    },
    // Delete all delegated data grants linked with a data grant
    async deleteByDataGrant(ctx) {
      const { dataGrant } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#delegationOfGrant': getId(dataGrant)
          },
          webId: dataGrant['interop:dataOwner']
        },
        { parentCtx: ctx }
      );

      for (const delegatedDataGrant of arrayOf(filteredContainer['ldp:contains'])) {
        await this.actions.delete(
          { resourceUri: getId(delegatedDataGrant), webId: dataGrant['interop:dataOwner'] },
          { parentCtx: ctx }
        );
      }
    },
    // Get the delegated data grant generated for a grantee from a data grant
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
    // Find the delegated data grants, stored in the granter storage
    async getByDataAuthorization(ctx) {
      const { dataAuthorization } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#dataOwner': dataAuthorization['interop:dataOwner'],
            'http://www.w3.org/ns/solid/interop#grantee': dataAuthorization['interop:grantee'],
            'http://www.w3.org/ns/solid/interop#hasDataRegistration': dataAuthorization['interop:hasDataRegistration']
          },
          webId: dataAuthorization['dc:creator'] // Until we have a interop:authorizedBy predicate ?
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0];
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
  }
};
