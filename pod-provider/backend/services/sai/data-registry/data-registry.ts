import { triple, namedNode } from '@rdfjs/data-model';
import { SingleResourceContainerMixin, arrayOf, delay } from '@semapps/ldp';

const DataRegistrySchema = {
  name: 'data-registry',
  mixins: [SingleResourceContainerMixin],
  settings: {
    acceptedTypes: ['interop:DataRegistry'],
    podProvider: true
  },
  dependencies: ['registry-set'],
  actions: {
    async add(ctx) {
      const { podOwner, dataRegistrationUri } = ctx.params;

      const dataRegistryUri = await this.actions.waitForResourceCreation({ webId: podOwner }, { parentCtx: ctx });

      await this.actions.patch(
        {
          resourceUri: dataRegistryUri,
          triplesToAdd: [
            triple(
              namedNode(dataRegistryUri),
              namedNode('http://www.w3.org/ns/solid/interop#hasDataRegistration'),
              namedNode(dataRegistrationUri)
            )
          ],
          webId: podOwner
        },
        { parentCtx: ctx }
      );
    },
    async remove(ctx) {
      const { podOwner, dataRegistrationUri } = ctx.params;

      const dataRegistryUri = await this.actions.waitForResourceCreation({ webId: podOwner }, { parentCtx: ctx });

      await this.actions.patch(
        {
          resourceUri: dataRegistryUri,
          triplesToRemove: [
            triple(
              namedNode(dataRegistryUri),
              namedNode('http://www.w3.org/ns/solid/interop#hasDataRegistration'),
              namedNode(dataRegistrationUri)
            )
          ],
          webId: podOwner
        },
        { parentCtx: ctx }
      );
    },
    /**
     * Wait until all data registrations have been created for the newly-created user
     */
    async awaitCreateComplete(ctx) {
      const { webId } = ctx.params;

      const containers = await ctx.call('ldp.registry.list');
      const numContainersWithShapeTree = Object.values(containers).filter(container => container.shapeTreeUri).length;

      let numDataRegistrations;
      let attempts = 0;
      do {
        attempts += 1;
        if (attempts > 1) await delay(1000);
        const dataRegistry = await this.actions.get({ webId }, { parentCtx: ctx });
        numDataRegistrations = arrayOf(dataRegistry['interop:hasDataRegistration']).length;
        if (attempts > 30)
          throw new Error(
            `After 30s, user ${webId} has only ${numDataRegistrations} data registrations. Expecting ${numContainersWithShapeTree}`
          );
      } while (numDataRegistrations < numContainersWithShapeTree);
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
              namedNode('http://www.w3.org/ns/solid/interop#hasDataRegistry'),
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

export default DataRegistrySchema;
