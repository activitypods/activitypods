const path = require('path');
const { arrayOf } = require('@semapps/ldp');

module.exports = {
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

      const authorizations = await ctx.call('access-authorizations.listForSingleResource', {
        resourceUri,
        webId
      });

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
