const urlJoin = require('url-join');
const { triple, namedNode } = require('@rdfjs/data-model');
const { SingleResourceContainerMixin, getWebIdFromUri } = require('@semapps/ldp');
const CONFIG = require('../../config/config');

module.exports = {
  name: 'auth-agent',
  mixins: [SingleResourceContainerMixin],
  settings: {
    acceptedTypes: ['interop:AuthorizationAgent'],
    initialValue: {
      'interop:hasAuthorizationRedirectEndpoint': urlJoin(CONFIG.FRONTEND_URL, 'authorize'),
      'interop:hasDelegationIssuanceEndpoint': urlJoin(CONFIG.BASE_URL, '.auth-agent/delegation/issue')
    },
    podProvider: true,
    newResourcesPermissions: {
      anon: {
        read: true
      }
    }
  },
  actions: {
    // Action from the ControlledContainerMixin, called when we do GET or HEAD requests on resources
    async getHeaderLinks(ctx) {
      let agentRegistration;

      if (ctx.meta.impersonatedUser) {
        // The fetch is made by a registered app
        const agentUri = ctx.meta.webId;
        const podOwner = ctx.meta.impersonatedUser;
        agentRegistration = await ctx.call('app-registrations.getForAgent', { agentUri, podOwner });
      } else {
        // The fetch is made by a social agent
        const agentUri = ctx.meta.webId;
        const podOwner = getWebIdFromUri(ctx.params.uri);
        agentRegistration = await ctx.call('social-agent-registrations.getForAgent', { agentUri, podOwner });
      }

      if (agentRegistration) {
        return [
          {
            uri: agentRegistration['interop:registeredAgent'],
            anchor: agentRegistration.id || agentRegistration['@id'],
            rel: 'http://www.w3.org/ns/solid/interop#registeredAgent'
          }
        ];
      }
    }
  },
  hooks: {
    after: {
      async post(ctx, res) {
        await ctx.call('ldp.resource.patch', {
          resourceUri: ctx.params.webId,
          triplesToAdd: [
            triple(
              namedNode(ctx.params.webId),
              namedNode('http://www.w3.org/ns/solid/interop#hasAuthorizationAgent'),
              namedNode(res)
            )
          ],
          webId: 'system'
        });
        return res;
      }
    }
  }
};
