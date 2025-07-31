import { triple, namedNode } from '@rdfjs/data-model';
import { SingleResourceContainerMixin } from '@semapps/ldp';
import { ServiceSchema, defineAction } from 'moleculer';

const AgentRegistryServiceSchema = {
  name: 'agent-registry' as const,
  mixins: [SingleResourceContainerMixin],

  settings: {
    acceptedTypes: ['interop:AgentRegistry'],
    podProvider: true
  },

  dependencies: ['registry-set'],

  actions: {
    add: defineAction({
      async handler(ctx: any) {
        const { podOwner, appRegistrationUri, socialAgentRegistrationUri } = ctx.params;

        if (!appRegistrationUri && !socialAgentRegistrationUri)
          throw new Error(`The params appRegistrationUri or socialAgentRegistrationUri are required`);

        const agentRegistryUri = await this.actions.getResourceUri({ webId: podOwner }, { parentCtx: ctx });

        await this.actions.patch(
          {
            resourceUri: agentRegistryUri,
            triplesToAdd: [
              triple(
                namedNode(agentRegistryUri),
                namedNode(
                  appRegistrationUri
                    ? 'http://www.w3.org/ns/solid/interop#hasApplicationRegistration'
                    : 'http://www.w3.org/ns/solid/interop#hasSocialAgentRegistration'
                ),
                namedNode(appRegistrationUri || socialAgentRegistrationUri)
              )
            ],
            webId: 'system'
          },
          { parentCtx: ctx }
        );
      }
    }),

    remove: defineAction({
      async handler(ctx: any) {
        const { podOwner, appRegistrationUri, socialAgentRegistrationUri } = ctx.params;

        if (!appRegistrationUri && !socialAgentRegistrationUri)
          throw new Error(`The params appRegistrationUri or socialAgentRegistrationUri are required`);

        const agentRegistryUri = await this.actions.getResourceUri({ webId: podOwner }, { parentCtx: ctx });

        await this.actions.patch(
          {
            resourceUri: agentRegistryUri,
            triplesToRemove: [
              triple(
                namedNode(agentRegistryUri),
                namedNode(
                  appRegistrationUri
                    ? 'http://www.w3.org/ns/solid/interop#hasApplicationRegistration'
                    : 'http://www.w3.org/ns/solid/interop#hasSocialAgentRegistration'
                ),
                namedNode(appRegistrationUri || socialAgentRegistrationUri)
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
      async post(ctx: any, res: any) {
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

export default AgentRegistryServiceSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AgentRegistryServiceSchema.name]: typeof AgentRegistryServiceSchema;
    }
  }
}
