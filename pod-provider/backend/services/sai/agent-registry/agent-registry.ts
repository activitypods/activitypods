import rdf from '@rdfjs/data-model';
import { ControlledResourceMixin } from '@semapps/ldp';
import { ServiceSchema } from 'moleculer';
const ALLOWED_TYPES = ['interop:ApplicationRegistration', 'interop:SocialAgentRegistration'];

const AgentRegistryService = {
  name: 'agent-registry' as const,
  mixins: [ControlledResourceMixin],
  settings: {
    types: ['interop:AgentRegistry']
  },
  dependencies: ['registry-set'],
  actions: {
    add: {
      async handler(ctx) {
        const { podOwner, agentRegistrationUri, agentRegistrationType } = ctx.params;

        if (!ALLOWED_TYPES.includes(agentRegistrationType)) {
          throw new Error(`The agentRegistrationType param must be ${ALLOWED_TYPES.join(' or ')}`);
        }

        const agentRegistryUri = await this.actions.getResourceUri({ webId: podOwner }, { parentCtx: ctx });

        await this.actions.patch(
          {
            resourceUri: agentRegistryUri,
            triplesToAdd: [
              rdf.quad(
                rdf.namedNode(agentRegistryUri),
                rdf.namedNode(
                  agentRegistrationType === 'interop:ApplicationRegistration'
                    ? 'http://www.w3.org/ns/solid/interop#hasApplicationRegistration'
                    : 'http://www.w3.org/ns/solid/interop#hasSocialAgentRegistration'
                ),
                rdf.namedNode(agentRegistrationUri)
              )
            ],
            webId: 'system'
          },
          { parentCtx: ctx }
        );
      }
    },

    remove: {
      async handler(ctx) {
        const { podOwner, agentRegistrationUri, agentRegistrationType } = ctx.params;

        if (!ALLOWED_TYPES.includes(agentRegistrationType)) {
          throw new Error(`The agentRegistrationType param must be ${ALLOWED_TYPES.join(' or ')}`);
        }
        const agentRegistryUri = await this.actions.getResourceUri({ webId: podOwner }, { parentCtx: ctx });

        await this.actions.patch(
          {
            resourceUri: agentRegistryUri,
            triplesToRemove: [
              rdf.quad(
                rdf.namedNode(agentRegistryUri),
                rdf.namedNode(
                  agentRegistrationType === 'interop:ApplicationRegistration'
                    ? 'http://www.w3.org/ns/solid/interop#hasApplicationRegistration'
                    : 'http://www.w3.org/ns/solid/interop#hasSocialAgentRegistration'
                ),
                rdf.namedNode(agentRegistrationUri)
              )
            ],
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
        // Attach the registry to the registry set
        const registrySetUri = await ctx.call('registry-set.getResourceUri', { webId: ctx.params.webId });
        await ctx.call('registry-set.patch', {
          resourceUri: registrySetUri,
          triplesToAdd: [
            rdf.quad(
              rdf.namedNode(registrySetUri),
              rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAgentRegistry'),
              rdf.namedNode(res)
            )
          ],
          webId: 'system'
        });
        return res;
      }
    }
  }
} satisfies ServiceSchema;

export default AgentRegistryService;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AgentRegistryService.name]: typeof AgentRegistryService;
    }
  }
}
