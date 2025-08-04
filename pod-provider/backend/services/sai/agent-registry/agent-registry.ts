import { triple, namedNode } from '@rdfjs/data-model';
import { SingleResourceContainerMixin } from '@semapps/ldp';
import { ServiceSchema, defineAction } from 'moleculer';
const ALLOWED_TYPES = ['interop:ApplicationRegistration', 'interop:SocialAgentRegistration'];

const AgentRegistrySchema = {
  name: 'agent-registry' as const,
  // @ts-expect-error TS(2322): Type '{ mixins: { settings: { path: null; accepted... Remove this comment to see the full error message
  mixins: [SingleResourceContainerMixin],
  settings: {
    acceptedTypes: ['interop:AgentRegistry'],
    podProvider: true
  },
  dependencies: ['registry-set'],
  actions: {
    add: defineAction({
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
              triple(
                namedNode(agentRegistryUri),
                namedNode(
                  agentRegistrationType === 'interop:ApplicationRegistration'
                    ? 'http://www.w3.org/ns/solid/interop#hasApplicationRegistration'
                    : 'http://www.w3.org/ns/solid/interop#hasSocialAgentRegistration'
                ),
                namedNode(agentRegistrationUri)
              )
            ],
            webId: 'system'
          },
          { parentCtx: ctx }
        );
      }
    }),

    remove: defineAction({
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
              triple(
                namedNode(agentRegistryUri),
                namedNode(
                  agentRegistrationType === 'interop:ApplicationRegistration'
                    ? 'http://www.w3.org/ns/solid/interop#hasApplicationRegistration'
                    : 'http://www.w3.org/ns/solid/interop#hasSocialAgentRegistration'
                ),
                namedNode(agentRegistrationUri)
              )
            ],
            webId: 'system'
          },
          { parentCtx: ctx }
        );
      }
    })
  },
  hooks: {
    after: {
      async post(ctx, res) {
        // Attach the registry to the registry set
        const registrySetUri = await ctx.call('registry-set.getResourceUri', { webId: ctx.params.webId });
        await ctx.call('registry-set.patch', {
          resourceUri: registrySetUri,
          triplesToAdd: [
            triple(
              namedNode(registrySetUri),
              namedNode('http://www.w3.org/ns/solid/interop#hasAgentRegistry'),
              namedNode(res)
            )
          ],
          webId: 'system'
        });
        return res;
      }
    }
  }
} satisfies ServiceSchema;

export default AgentRegistrySchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AgentRegistrySchema.name]: typeof AgentRegistrySchema;
    }
  }
}
