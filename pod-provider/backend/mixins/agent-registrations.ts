import { arrayOf, getId } from '@semapps/ldp';
import rdf from '@rdfjs/data-model';
import { ServiceSchema } from 'moleculer';

const UPDATED_AT = rdf.namedNode('http://www.w3.org/ns/solid/interop#updatedAt');
const DATE_TIME = rdf.namedNode('http://www.w3.org/2001/XMLSchema#dateTime');

// Concurrent patches may leave several values, so all of them are removed
export const updatedAtTriples = (agentRegistration: any) => {
  const subject = rdf.namedNode(getId(agentRegistration));
  return {
    toAdd: rdf.quad(subject, UPDATED_AT, rdf.literal(new Date().toISOString(), DATE_TIME)),
    toRemove: arrayOf(agentRegistration['interop:updatedAt']).map((value: string) =>
      rdf.quad(subject, UPDATED_AT, rdf.literal(value, DATE_TIME))
    )
  };
};

/**
 * Mixin used by the AppRegistrationsService and SocialAgentRegistrationsService
 * See https://solid.github.io/data-interoperability-panel/specification/#ar
 */
const AgentRegistrationsMixin = {
  actions: {
    getForAgent: {
      async handler(ctx) {
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
      }
    },

    isRegistered: {
      async handler(ctx) {
        const { agentUri, podOwner } = ctx.params;
        return !!(await this.actions.getForAgent({ agentUri, podOwner }, { parentCtx: ctx }));
      }
    },

    getGrants: {
      // Get all grants associated with an agent registration
      async handler(ctx) {
        const { agentRegistration, podOwner } = ctx.params;
        let grants: any = [];

        for (const grantUri of arrayOf(agentRegistration['interop:hasAccessGrant'])) {
          const grant = await ctx.call('access-grants.get', {
            resourceUri: grantUri,
            webId: podOwner
          });
          grants.push(grant);
        }

        return grants;
      }
    },

    addGrant: {
      // Attach a grant to the grantee's agent registration
      // Pass grants instead of grant to attach several grants of the same grantee with a single patch
      async handler(ctx) {
        const grants = ctx.params.grants || [ctx.params.grant];
        if (grants.length === 0) return;
        const [grant] = grants;

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

        const { toAdd, toRemove } = updatedAtTriples(agentRegistration);

        await this.actions.patch(
          {
            resourceUri: getId(agentRegistration),
            triplesToAdd: [
              ...grants.map((g: any) =>
                rdf.quad(
                  rdf.namedNode(getId(agentRegistration)),
                  rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAccessGrant'),
                  rdf.namedNode(getId(g))
                )
              ),
              toAdd
            ],
            triplesToRemove: toRemove.length > 0 ? toRemove : undefined,
            webId: 'system'
          },
          { parentCtx: ctx }
        );
      }
    },

    removeGrant: {
      // Pass grants instead of grant to detach several grants of the same grantee with a single patch
      async handler(ctx) {
        const grants = ctx.params.grants || [ctx.params.grant];
        if (grants.length === 0) return;
        const [grant] = grants;

        const agentRegistration = await this.actions.getForAgent(
          {
            agentUri: grant['interop:grantee'],
            podOwner: grant['interop:grantedBy']
          },
          { parentCtx: ctx }
        );

        if (agentRegistration) {
          const triplesToRemove = grants.map((g: any) =>
            rdf.quad(
              rdf.namedNode(getId(agentRegistration)),
              rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAccessGrant'),
              rdf.namedNode(getId(g))
            )
          );

          const { toAdd, toRemove } = updatedAtTriples(agentRegistration);
          triplesToRemove.push(...toRemove);

          await this.actions.patch(
            {
              resourceUri: getId(agentRegistration),
              triplesToAdd: [toAdd],
              triplesToRemove,
              webId: 'system'
            },
            { parentCtx: ctx }
          );
        }
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
} satisfies Partial<ServiceSchema>;

export default AgentRegistrationsMixin;
