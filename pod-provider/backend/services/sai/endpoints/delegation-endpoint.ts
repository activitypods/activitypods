import path from 'path';
const { MoleculerError } = require('moleculer').Errors;
import { arrayOf, getDatasetFromUri, getId } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';
import { parseHeader, negotiateContentType, parseJson, parseTurtle } from '@semapps/middlewares';

const DelegationEndpointSchema = {
  name: 'delegation-endpoint',
  dependencies: ['api', 'ldp'],
  async started() {
    const basePath = await this.broker.call('ldp.getBasePath');
    const middlewares = [parseHeader, negotiateContentType, parseJson, parseTurtle];
    await this.broker.call('api.addRoute', {
      route: {
        name: 'sai-delegation-endpoint',
        path: path.join(basePath, '/.auth-agent/delegation'),
        authorization: true,
        authentication: false,
        bodyParsers: false,
        aliases: {
          'POST /issue': [...middlewares, 'delegation-endpoint.issue_api']
        }
      }
    });
  },
  actions: {
    async issue_api(ctx) {
      const delegatedGrant = ctx.params;

      ctx.meta.dataset = getDatasetFromUri(delegatedGrant['interop:dataOwner']);

      const grantUri = await this.actions.issue({ delegatedGrant }, { parentCtx: ctx });

      ctx.meta.$responseHeaders = { Location: grantUri };
      // We need to set this also here (in addition to above) or we get a Moleculer warning
      ctx.meta.$location = grantUri;
      ctx.meta.$statusCode = 201;
    },
    async issue(ctx) {
      const { delegatedGrant } = ctx.params;
      const webId = ctx.meta.webId;
      const dataOwner = delegatedGrant['interop:dataOwner'];

      if (getId(delegatedGrant)) {
        throw new Error(`Delegated access grant to issue cannot already have an ID. Found ${getId(delegatedGrant)}`);
      }

      const originalGrant = await ctx.call('access-grants.get', {
        resourceUri: delegatedGrant['interop:delegationOfGrant'],
        webId: dataOwner
      });

      if (delegatedGrant['interop:grantedBy'] !== webId) {
        throw new MoleculerError('You cannot grant access for someone else', 401, 'FORBIDDEN');
      }

      // Check delegation is allowed, except for applications
      if (
        (originalGrant['interop:delegationAllowed'] !== true ||
          (originalGrant['interop:delegationLimit'] && originalGrant['interop:delegationLimit'] < 1)) &&
        !delegatedGrant['interop:granteeType'] === 'interop:Application'
      ) {
        throw new MoleculerError('Delegation not allowed', 401, 'FORBIDDEN');
      }

      if (
        originalGrant['interop:dataOwner'] !== delegatedGrant['interop:dataOwner'] ||
        originalGrant['interop:scopeOfGrant'] !== delegatedGrant['interop:scopeOfGrant'] ||
        originalGrant['interop:hasDataRegistration'] !== delegatedGrant['interop:hasDataRegistration'] ||
        originalGrant['interop:registeredShapeTree'] !== delegatedGrant['interop:registeredShapeTree'] ||
        originalGrant['interop:scopeOfGrant'] !== delegatedGrant['interop:scopeOfGrant'] ||
        !arrayOf(delegatedGrant['interop:hasDataInstance']).every(uri =>
          arrayOf(originalGrant['interop:hasDataInstance']).includes(uri)
        ) ||
        !arrayOf(delegatedGrant['interop:accessMode']).every(mode =>
          arrayOf(originalGrant['interop:accessMode']).includes(mode)
        )
      ) {
        throw new MoleculerError('Delegated grant does not match original grant', 400, 'BAD REQUEST');
      }

      const delegatedGrantUri = await ctx.call('delegated-access-grants.post', {
        resource: delegatedGrant,
        contentType: MIME_TYPES.JSON,
        webId: dataOwner
      });

      await ctx.emit(
        'delegated-access-grants.issued',
        { delegatedGrant: { id: delegatedGrantUri, ...delegatedGrant } }
        // { meta: { webId: null, dataset: null } }
      );

      return delegatedGrantUri;
    }
  }
};

export default DelegationEndpointSchema;
