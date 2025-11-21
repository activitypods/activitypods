import rdf from '@rdfjs/data-model';
import { ControlledResourceMixin } from '@semapps/ldp';
import { ServiceSchema } from 'moleculer';
const ALLOWED_TYPES = ['interop:ApplicationRegistration', 'interop:SocialAgentRegistration'];

const AgentRegistryService = {
  name: 'agent-registry' as const,
  // @ts-expect-error TS(2322): Type '{ mixins: { settings: { path: null; accepted... Remove this comment to see the full error message
  mixins: [ControlledResourceMixin],
  settings: {
    path: '/agent-registry',
    types: ['interop:AgentRegistry']
  },
  dependencies: ['registry-set'],
  actions: {
    add: {
      async handler(ctx: any) {
        const { agentRegistrationUri, agentRegistrationType } = ctx.params;

        if (!ALLOWED_TYPES.includes(agentRegistrationType)) {
          throw new Error(`The agentRegistrationType param must be ${ALLOWED_TYPES.join(' or ')}`);
        }

        const agentRegistryUri = await this.actions.getUri({}, { parentCtx: ctx });

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
      async handler(ctx: any) {
        const { agentRegistrationUri, agentRegistrationType } = ctx.params;

        if (!ALLOWED_TYPES.includes(agentRegistrationType)) {
          throw new Error(`The agentRegistrationType param must be ${ALLOWED_TYPES.join(' or ')}`);
        }
        const agentRegistryUri = await this.actions.getUri({}, { parentCtx: ctx });

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
  events: {
    'registry-set.created': {
      async handler(ctx: any) {
        const { resourceUri: registrySetUri } = ctx.params;
        const agentRegistryUri = await this.actions.waitForCreation({}, { parentCtx: ctx });
        await ctx.call('ldp.resource.patch', {
          resourceUri: registrySetUri,
          triplesToAdd: [
            rdf.quad(
              rdf.namedNode(registrySetUri),
              rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAgentRegistry'),
              rdf.namedNode(agentRegistryUri)
            )
          ],
          webId: 'system'
        });
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
