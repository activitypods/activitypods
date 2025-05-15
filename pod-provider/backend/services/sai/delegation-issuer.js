const path = require('path');
const { MoleculerError } = require('moleculer').Errors;
const { arrayOf, getDatasetFromUri, getId } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { parseHeader, negotiateContentType, parseJson, parseTurtle } = require('@semapps/middlewares');

module.exports = {
  name: 'delegation-issuer',
  dependencies: ['api', 'ldp'],
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

      // Assume delegation is for an application if access needs are defined
      // TODO Find a better method to identify application data grants
      if (
        (originalDataGrant['interop:delegationAllowed'] !== true ||
          (originalDataGrant['interop:delegationLimit'] && originalDataGrant['interop:delegationLimit'] < 1)) &&
        !delegatedDataGrant['interop:satisfiesAccessNeed']
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

      const delegatedDataGrantUri = await ctx.call('delegated-data-grants.post', {
        resource: delegatedDataGrant,
        contentType: MIME_TYPES.JSON,
        webId: dataOwner
      });

      await ctx.emit(
        'delegated-data-grants.issued',
        { delegatedDataGrant: { id: delegatedDataGrantUri, ...delegatedDataGrant } }
        // { meta: { webId: null, dataset: null } }
      );

      return delegatedDataGrantUri;
    },
    async remoteIssue(ctx) {
      const { delegatedDataGrant } = ctx.params;
      const webId = ctx.params.webId || ctx.meta.webId || 'anon';

      const dataOwnerUri = delegatedDataGrant['interop:dataOwner'];
      const baseUrl = await ctx.call('ldp.getBaseUrl');

      if (dataOwnerUri.startsWith(baseUrl)) {
        // User is on same server, call endpoint directly
        return await this.actions.issue(
          { delegatedDataGrant },
          { meta: { dataset: getDatasetFromUri(dataOwnerUri), webId }, parentCtx: ctx }
        );
      } else {
        const dataOwner = await ctx.call('activitypub.actor.get', { actorUri: dataOwnerUri });

        if (!dataOwner['interop:hasAuthorizationAgent'])
          throw new Error(`Data owner ${dataOwnerUri} has no authorization agent`);

        const authorizationAgent = await ctx.call('authorization-agent.get', {
          resourceUri: dataOwner['interop:hasAuthorizationAgent']
        });

        if (!authorizationAgent['interop:hasDelegationIssuanceEndpoint'])
          throw new Error(`Data owner ${dataOwnerUri} has no delegation issuance endpoint`);

        const response = await ctx.call('signature.proxy.query', {
          url: authorizationAgent['interop:hasDelegationIssuanceEndpoint'],
          method: 'POST',
          headers: {
            'Content-Type': 'application/ld+json'
          },
          body: JSON.stringify(delegatedDataGrant),
          actorUri: webId
        });

        if (response.status === 201) {
          return response.headers.get('Location');
        } else {
          throw new Error(
            `Could not fetch ${authorizationAgent['interop:hasDelegationIssuanceEndpoint']}. Response code: ${response.status}`
          );
        }
      }
    },
    async remoteDelete(ctx) {
      const { delegatedDataGrant } = ctx.params;
      const webId = ctx.params.webId || ctx.meta.webId || 'anon';

      const dataOwnerUri = delegatedDataGrant['interop:dataOwner'];
      const baseUrl = await ctx.call('ldp.getBaseUrl');

      if (dataOwnerUri.startsWith(baseUrl)) {
        // User is on same server, delete directly
        await ctx.call(
          'ldp.resource.delete',
          { resourceUri: getId(delegatedDataGrant), webId },
          { meta: { dataset: getDatasetFromUri(dataOwnerUri) }, parentCtx: ctx }
        );
      } else {
        const response = await ctx.call('signature.proxy.query', {
          url: getId(delegatedDataGrant),
          method: 'DELETE',
          actorUri: webId
        });

        if (response.status !== 204) {
          throw new Error(
            `Could not delete delegated data grant ${getId(delegatedDataGrant)}. Response code: ${response.status}`
          );
        }
      }
    }
  }
};
