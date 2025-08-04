import { arrayOf, getId } from '@semapps/ldp';
import { triple, namedNode, literal } from '@rdfjs/data-model';

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
    // Get all grants associated with an agent registration
    async getGrants(ctx) {
      const { agentRegistration, podOwner } = ctx.params;
      let grants = [];

      for (const grantUri of arrayOf(agentRegistration['interop:hasAccessGrant'])) {
        const grant = await ctx.call('access-grants.get', {
          resourceUri: grantUri,
          webId: podOwner
        });
        grants.push(grant);
      }

      return grants;
    },
    // Attach a grant to the grantee's agent registration
    async addGrant(ctx) {
      const { grant } = ctx.params;

      let agentRegistration = await this.actions.getForAgent(
        {
          agentUri: grant['interop:grantee'],
          podOwner: grant['interop:grantedBy']
        },
        { parentCtx: ctx }
      );

      if (!agentRegistration) {
        // Create agent registration if it doesn't exist
        await this.actions.createOrUpdate(
          {
            agentUri: grant['interop:grantee'],
            podOwner: grant['interop:grantedBy']
          },
          { parentCtx: ctx }
        );

        // Get the newly created registration
        agentRegistration = await this.actions.getForAgent(
          {
            agentUri: grant['interop:grantee'],
            podOwner: grant['interop:grantedBy']
          },
          { parentCtx: ctx }
        );
      }

      await this.actions.patch(
        {
          resourceUri: getId(agentRegistration),
          triplesToAdd: [
            triple(
              namedNode(getId(agentRegistration)),
              namedNode('http://www.w3.org/ns/solid/interop#hasAccessGrant'),
              namedNode(getId(grant))
            ),
            triple(
              namedNode(getId(agentRegistration)),
              namedNode('http://www.w3.org/ns/solid/interop#updatedAt'),
              literal(new Date().toISOString(), 'http://www.w3.org/2001/XMLSchema#dateTime')
            )
          ],
          triplesToRemove: agentRegistration['interop:updatedAt'] && [
            triple(
              namedNode(getId(agentRegistration)),
              namedNode('http://www.w3.org/ns/solid/interop#updatedAt'),
              literal(agentRegistration['interop:updatedAt'], 'http://www.w3.org/2001/XMLSchema#dateTime')
            )
          ],
          webId: 'system'
        },
        { parentCtx: ctx }
      );
    },
    async removeGrant(ctx) {
      const { grant } = ctx.params;

      const agentRegistration = await this.actions.getForAgent(
        {
          agentUri: grant['interop:grantee'],
          podOwner: grant['interop:grantedBy']
        },
        { parentCtx: ctx }
      );

      if (agentRegistration) {
        const triplesToRemove = [
          triple(
            namedNode(getId(agentRegistration)),
            namedNode('http://www.w3.org/ns/solid/interop#hasAccessGrant'),
            namedNode(getId(grant))
          )
        ];

        if (agentRegistration['interop:updatedAt']) {
          triplesToRemove.push(
            triple(
              namedNode(getId(agentRegistration)),
              namedNode('http://www.w3.org/ns/solid/interop#updatedAt'),
              literal(agentRegistration['interop:updatedAt'], 'http://www.w3.org/2001/XMLSchema#dateTime')
            )
          );
        }

        await this.actions.patch(
          {
            resourceUri: getId(agentRegistration),
            triplesToAdd: [
              triple(
                namedNode(getId(agentRegistration)),
                namedNode('http://www.w3.org/ns/solid/interop#updatedAt'),
                literal(new Date().toISOString(), 'http://www.w3.org/2001/XMLSchema#dateTime')
              )
            ],
            triplesToRemove,
            webId: 'system'
          },
          { parentCtx: ctx }
        );
      }
    }
  },
  hooks: {
    after: {
      async post(ctx, res) {
        const webId = ctx.params.resource['interop:registeredBy'];

        // Add the agent registration to the agent registry
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

        const authorizations = await ctx.call('access-authorizations.listByGrantee', {
          grantee: agentUri,
          webId: podOwner
        });

        for (const authorization of authorizations) {
          await ctx.call('access-authorizations.delete', {
            resourceUri: getId(authorization),
            webId: podOwner
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

export default AgentRegistrationsMixin;
