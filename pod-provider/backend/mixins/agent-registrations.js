const { arrayOf } = require('@semapps/ldp');

/**
 * Mixin used by the AppRegistrationsService and SocialAgentRegistrationsService
 * See https://solid.github.io/data-interoperability-panel/specification/#ar
 */
const AgentRegistrationsMixin = {
  actions: {
    async getForAgent(ctx) {
      const { agentUri, podOwner } = ctx.params;

      const containerUri = await this.actions.getContainerUri({ webId: podOwner }, { parentCtx: ctx });

      const filteredContainer = await this.actions.list(
        {
          containerUri,
          filters: {
            'http://www.w3.org/ns/solid/interop#registeredAgent': agentUri,
            'http://www.w3.org/ns/solid/interop#registeredBy': podOwner
          },
          webId: 'system'
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0];
    },
    async isRegistered(ctx) {
      const { agentUri, podOwner } = ctx.params;
      return !!(await this.actions.getForAgent({ agentUri, podOwner }, { parentCtx: ctx }));
    },
    // Get all data grants associated with an agent registration
    async getDataGrants(ctx) {
      const { agentRegistration, podOwner } = ctx.params;
      let dataGrants = [];

      for (const accessGrantUri of arrayOf(agentRegistration['interop:hasAccessGrant'])) {
        const accessGrant = await ctx.call('access-grants.get', {
          resourceUri: accessGrantUri,
          webId: podOwner
        });
        for (const dataGrantUri of arrayOf(accessGrant['interop:hasDataGrant'])) {
          const dataGrant = await ctx.call('data-grants.get', {
            resourceUri: dataGrantUri,
            webId: podOwner
          });
          dataGrants.push(dataGrant);
        }
      }

      return dataGrants;
    }
  },
  hooks: {
    after: {
      async post(ctx, res) {
        const webId = ctx.params.resource['interop:registeredBy'];

        // Add the AgentRegistration to the AgentRegistry
        await ctx.call('agent-registry.add', {
          podOwner: webId,
          agentRegistrationUri: res,
          agentRegistrationType: arrayOf(this.settings.acceptedTypes)[0]
        });

        return res;
      },
      async delete(ctx, res) {
        const podOwner = res.oldData['interop:registeredBy'];
        const agentUri = res.oldData['interop:registeredAgent'];

        // DELETE ALL RELATED AUTHORIZATIONS
        // The related grants will also be deleted as a side effect

        const accessAuthorizations = await ctx.call('access-authorizations.listByGrantee', {
          grantee: agentUri,
          webId: podOwner
        });

        for (const accessAuthorization of accessAuthorizations) {
          for (const dataAuthorizationUri of arrayOf(accessAuthorization['interop:hasDataAuthorization'])) {
            await ctx.call('data-authorizations.delete', {
              resourceUri: dataAuthorizationUri,
              webId: 'system'
            });
          }

          await ctx.call('access-authorizations.delete', {
            resourceUri: accessAuthorization.id || accessAuthorization['@id'],
            webId: 'system'
          });
        }

        // REMOVE AGENT REGISTRATION FROM AGENT REGISTRY

        await ctx.call('agent-registry.remove', {
          podOwner,
          agentRegistrationUri: res.resourceUri,
          agentRegistrationType: arrayOf(this.settings.acceptedTypes)[0]
        });

        return res;
      }
    }
  }
};

module.exports = AgentRegistrationsMixin;
