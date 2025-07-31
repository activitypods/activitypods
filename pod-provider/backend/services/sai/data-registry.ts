import { triple, namedNode } from '@rdfjs/data-model';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { SingleResourceContainerMixin, arrayOf, delay } from '@semapps/ldp';

export default {
  name: 'data-registry',
  mixins: [SingleResourceContainerMixin],
  settings: {
    acceptedTypes: ['interop:DataRegistry'],
    podProvider: true
  },
  dependencies: ['registry-set'],
  actions: {
    async add(ctx: any) {
      const { podOwner, dataRegistrationUri } = ctx.params;

      // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ add(c... Remove this comment to see the full error message
      const dataRegistryUri = await this.actions.waitForResourceCreation({ webId: podOwner }, { parentCtx: ctx });

      // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ add(c... Remove this comment to see the full error message
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
    async remove(ctx: any) {
      const { podOwner, dataRegistrationUri } = ctx.params;

      // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ add(c... Remove this comment to see the full error message
      const dataRegistryUri = await this.actions.waitForResourceCreation({ webId: podOwner }, { parentCtx: ctx });

      // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ add(c... Remove this comment to see the full error message
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
    async awaitCreateComplete(ctx: any) {
      const { webId } = ctx.params;

      const containers = await ctx.call('ldp.registry.list');
      // @ts-expect-error TS(2571): Object is of type 'unknown'.
      const numContainersWithShapeTree = Object.values(containers).filter(container => container.shapeTreeUri).length;

      let numDataRegistrations;
      let attempts = 0;
      do {
        attempts += 1;
        if (attempts > 1) await delay(1000);
        // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ add(c... Remove this comment to see the full error message
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
      async post(ctx: any, res: any) {
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
