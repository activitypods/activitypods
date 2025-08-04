import path from 'path';
const { MoleculerError } = require('moleculer').Errors;
import { arrayOf } from '@semapps/ldp';

const AuthorizationEndpointSchema = {
  name: 'authorization-endpoint',
  dependencies: ['api', 'ldp'],
  async started() {
    const basePath = await this.broker.call('ldp.getBasePath');
    await this.broker.call('api.addRoute', {
      route: {
        name: 'sai-authorization-endpoint',
        path: path.join(basePath, '/.auth-agent/authorizations'),
        authorization: true,
        authentication: false,
        bodyParsers: {
          json: true
        },
        aliases: {
          'GET /': 'authorization-endpoint.getAuthorizations',
          'PUT /': 'authorization-endpoint.updateAuthorizations'
        }
      }
    });
  },
  actions: {
    async getAuthorizations(ctx) {
      const { resource: resourceUri } = ctx.params;

      const webId = ctx.meta.webId;
      const account = await ctx.call('auth.account.findByWebId', { webId });
      ctx.meta.dataset = account.username;

      if (!resourceUri.startsWith(`${webId}/`))
        throw new MoleculerError('Only the owner of a resource can fetch its authorizations', 403, 'FORBIDDEN');

      const authorizations = await ctx.call('access-authorizations.listForSingleResource', { resourceUri });

      return {
        resourceUri,
        authorizations: authorizations.map(authorization => ({
          grantee: authorization['interop:grantee'],
          accessModes: arrayOf(authorization['interop:accessMode'])
        }))
      };
    },
    /**
     * Mass-update access authorizations for a single resource
     */
    async updateAuthorizations(ctx) {
      const { resourceUri, authorizations } = ctx.params;

      const podOwner = ctx.meta.webId;
      const account = await ctx.call('auth.account.findByWebId', { webId: podOwner });
      ctx.meta.dataset = account.username;

      if (!resourceUri.startsWith(`${podOwner}/`))
        throw new MoleculerError('Only the owner of a resource can update its authorizations', 403, 'FORBIDDEN');

      for ({ grantee, accessModes } of authorizations) {
        if (accessModes.length > 0) {
          await ctx.call('access-authorizations.addForSingleResource', {
            resourceUri,
            podOwner,
            grantee,
            accessModes
          });
        } else {
          await ctx.call('access-authorizations.removeForSingleResource', {
            resourceUri,
            podOwner,
            grantee
          });
        }
      }
    }
  }
};

export default AuthorizationEndpointSchema;
