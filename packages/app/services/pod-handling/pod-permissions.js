const fetch = require('node-fetch');
const LinkHeader = require('http-link-header');
const { getAclUriFromResourceUri } = require('@semapps/webacl');
const { arrayOf } = require('@semapps/ldp');

module.exports = {
  name: 'pod-permissions',
  mixins: [FetchPodOrProxyMixin],
  actions: {
    async get(ctx) {
      const { uri, actorUri } = ctx.params;

      const { status, body } = await this.actions.fetch({
        url: this.getAclUri(uri),
        headers: {
          Accept: 'application/ld+json'
        },
        actorUri
      });

      return status === 200 ? body['@graph'] : false;
    },
    async add(ctx) {
      const { uri, agentUri, agentPredicate, mode, actorUri } = ctx.params;

      if (!['acl:agent', 'acl:agentGroup', 'acl:agentClass'].includes(agentPredicate)) {
        throw new Error(`The agentPredicate must be 'acl:agent', 'acl:agentGroup' or 'acl:agentClass'`);
      }

      if (!['acl:Read', 'acl:Append', 'acl:Write', 'acl:Control'].includes(mode)) {
        throw new Error(`The mode must be 'acl:Read', 'acl:Append', 'acl:Write' or 'acl:Control'`);
      }

      const { body } = await this.actions.fetch({
        url: this.getAclUri(uri),
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/ld+json'
        },
        body: JSON.stringify({
          '@context': await ctx.call('jsonld.context.get'),
          '@graph': [
            {
              '@id': `#${mode.replace('acl:', '')}`,
              '@type': 'acl:Authorization',
              [agentPredicate]: agentUri,
              'acl:accessTo': uri,
              'acl:mode': mode
            }
          ]
        }),
        actorUri
      });

      return body;
    },
    async remove(ctx) {
      const { uri, agentUri, agentPredicate, mode, actorUri } = ctx.params;

      if (!['acl:agent', 'acl:agentGroup', 'acl:agentClass'].includes(agentPredicate)) {
        throw new Error(`The agentPredicate must be 'acl:agent', 'acl:agentGroup' or 'acl:agentClass'`);
      }

      if (!['acl:Read', 'acl:Append', 'acl:Write', 'acl:Control'].includes(mode)) {
        throw new Error(`The mode must be 'acl:Read', 'acl:Append', 'acl:Write' or 'acl:Control'`);
      }

      // We have no API to remove permissions, so first get the permissions, then use PUT to update them.
      // There is an issue to improve this: https://github.com/assemblee-virtuelle/semapps/issues/1234
      const currentPermissions = await this.actions.getPermissions({ uri, actorUri }, { parentCtx: ctx });

      const updatedPermissions = currentPermissions
        .filter(authorization => !authorization['@id'].includes('#Default'))
        .map(authorization => {
          const modes = arrayOf(authorization['acl:mode']);
          let agents = arrayOf(authorization[predicate]);
          if (modes.includes(mode) && agents.includes(agentUri)) {
            agents = agents.filter(agent => agent !== agentUri);
          }
          return { ...authorization, [agentPredicate]: agents };
        });

      await this.actions.fetch({
        url: this.getAclUri(uri),
        method: 'PUT',
        headers: {
          'Content-Type': 'application/ld+json'
        },
        body: JSON.stringify({
          '@context': await ctx.call('jsonld.context.get'),
          '@graph': updatedPermissions
        }),
        actorUri
      });
    }
  },
  methods: {
    async getAclUri(uri) {
      try {
        const { headers } = await fetch(uri, { method: 'HEAD' });
        const linkHeader = LinkHeader.parse(headers.link);
        const aclLinkHeader = linkHeader.rel('acl');
        return aclLinkHeader[0].uri;
      } catch (e) {
        this.logger.warn(`Could not get link header for ${uri}`);
        // Try to guess it from the URL
        return getAclUriFromResourceUri(uri);
      }
    }
  }
};
