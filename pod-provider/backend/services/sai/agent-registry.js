const { triple, namedNode } = require('@rdfjs/data-model');
const { SingleResourceContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'agent-registry',
  mixins: [SingleResourceContainerMixin],
  settings: {
    acceptedTypes: ['interop:AgentRegistry'],
    podProvider: true,
    description: {
      labelMap: {
        en: 'Agent Registries'
      },
      internal: true
    }
  },
  dependencies: ['registry-set'],
  actions: {
    async add(ctx) {
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
    },
    async remove(ctx) {
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
};
