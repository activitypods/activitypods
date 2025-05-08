const path = require('path');
const { MoleculerError } = require('moleculer').Errors;
const { ControlledContainerMixin, arrayOf, getId, getDatasetFromUri } = require('@semapps/ldp');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const { parseHeader, negotiateContentType, parseJson, parseTurtle } = require('@semapps/middlewares');
const ImmutableContainerMixin = require('../../../mixins/immutable-container-mixin');

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
    typeIndex: 'private',
    readOnly: true
  },
  dependencies: ['ldp', 'api'],
  async started() {
    const basePath = await this.broker.call('ldp.getBasePath');
    const middlewares = [parseHeader, negotiateContentType, parseJson, parseTurtle];
    await this.broker.call('api.addRoute', {
      route: {
        name: 'auth-agent-delegation',
        path: path.join(basePath, '/.auth-agent/delegation'),
        authorization: true,
        authentication: false,
        bodyParsers: false,
        aliases: {
          'POST /issue': [...middlewares, 'delegated-data-grants.issue_api']
        }
      }
    });
  },
  actions: {
    async issue_api(ctx) {
      const delegatedDataGrant = ctx.params;

      ctx.meta.dataset = getDatasetFromUri(delegatedDataGrant['interop:dataOwner']);

      const grantUri = await this.actions.issue({ delegatedDataGrant }, { parentCtx: ctx });

      ctx.meta.$responseHeaders = { Location: grantUri };
      // We need to set this also here (in addition to above) or we get a Moleculer warning
      ctx.meta.$location = grantUri;
      ctx.meta.$statusCode = 201;
    },
    async issue(ctx) {
      const { delegatedDataGrant } = ctx.params;
      const webId = ctx.meta.webId;
      const dataOwner = delegatedDataGrant['interop:dataOwner'];

      const originalDataGrant = await ctx.call('data-grants.get', {
        resourceUri: delegatedDataGrant['interop:delegationOfGrant'],
        webId: dataOwner
      });

      if (delegatedDataGrant['interop:grantedBy'] !== webId) {
        throw new MoleculerError('You cannot grant for someone else', 401, 'FORBIDDEN');
      }

      if (
        originalDataGrant['interop:delegationAllowed'] !== true ||
        (originalDataGrant['interop:delegationLimit'] && originalDataGrant['interop:delegationLimit'] < 1)
      ) {
        throw new MoleculerError('Delegation not allowed', 401, 'FORBIDDEN');
      }

      if (
        originalDataGrant['interop:dataOwner'] !== delegatedDataGrant['interop:dataOwner'] ||
        originalDataGrant['interop:scopeOfGrant'] !== delegatedDataGrant['interop:scopeOfGrant'] ||
        originalDataGrant['interop:hasDataRegistration'] !== delegatedDataGrant['interop:hasDataRegistration'] ||
        originalDataGrant['interop:registeredShapeTree'] !== delegatedDataGrant['interop:registeredShapeTree'] ||
        originalDataGrant['interop:scopeOfGrant'] !== delegatedDataGrant['interop:scopeOfGrant'] ||
        !arrayOf(delegatedDataGrant['interop:hasDataInstance']).every(uri =>
          arrayOf(originalDataGrant['interop:hasDataInstance']).includes(uri)
        ) ||
        !arrayOf(delegatedDataGrant['interop:accessMode']).every(mode =>
          arrayOf(originalDataGrant['interop:accessMode']).includes(mode)
        )
      ) {
        throw new MoleculerError('Delegated data grant does not match original grant', 400, 'BAD REQUEST');
      }

      const grantUri = await this.actions.post(
        {
          resource: delegatedDataGrant,
          contentType: MIME_TYPES.JSON,
          webId: dataOwner
        },
        {
          parentCtx: ctx
        }
      );

      return grantUri;
    },
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
              'interop:delegationOfGrant': getId(dataGrant)
            },
            contentType: MIME_TYPES.JSON,
            webId: dataAuthorization['interop:dataOwner']
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

      const baseUrl = await this.broker.call('ldp.getBaseUrl');

      if (dataGrant['interop:dataOwner'].startsWith(baseUrl)) {
        // User is on same server, call endpoint directly
        const delegatedDataGrantUri = await this.actions.issue(
          {
            delegatedDataGrant: {
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
            }
          },
          { meta: { dataset: getDatasetFromUri(dataGrant['interop:dataOwner']) }, parentCtx: ctx }
        );

        // Now the delegated data grant has been created and validated, store it locally
        await ctx.call('ldp.remote.store', { resourceUri: delegatedDataGrantUri, webId });
        await this.actions.attach({ resourceUri: delegatedDataGrantUri, webId }, { parentCtx: ctx });

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
      } else {
        // TODO Fetch endpoint
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
  },
  hooks: {
    after: {
      async create(ctx, res) {
        const delegatedDataGrant = res.newData;

        // The grantee must be able to read the grant
        await ctx.call('webacl.resource.addRights', {
          resourceUri: getId(delegatedDataGrant),
          additionalRights: {
            user: {
              uri: delegatedDataGrant['interop:grantee'],
              read: true
            }
          },
          webId: 'system'
        });

        // The granter must be able to read and delete the grant
        await ctx.call('webacl.resource.addRights', {
          resourceUri: getId(delegatedDataGrant),
          additionalRights: {
            user: {
              uri: delegatedDataGrant['interop:grantedBy'],
              read: true,
              write: true
            }
          },
          webId: 'system'
        });

        return res;
      }
    }
  }
};
