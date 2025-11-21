import rdf from '@rdfjs/data-model';
import { ControlledResourceMixin, arrayOf, delay } from '@semapps/ldp';
import { ServiceSchema } from 'moleculer';

const DataRegistrySchema = {
  name: 'data-registry' as const,
  // @ts-expect-error TS(2322): Type '{ mixins: { settings: { path: null; accepted... Remove this comment to see the full error message
  mixins: [ControlledResourceMixin],
  settings: {
    path: '/data-registry',
    types: ['interop:DataRegistry']
  },
  dependencies: ['registry-set'],
  actions: {
    add: {
      async handler(ctx: any) {
        const { dataRegistrationUri } = ctx.params;

        const dataRegistryUri = await this.actions.waitForCreation({}, { parentCtx: ctx });

        await this.actions.patch(
          {
            resourceUri: dataRegistryUri,
            triplesToAdd: [
              rdf.quad(
                rdf.namedNode(dataRegistryUri),
                rdf.namedNode('http://www.w3.org/ns/solid/interop#hasDataRegistration'),
                rdf.namedNode(dataRegistrationUri)
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
        const { dataRegistrationUri } = ctx.params;

        const dataRegistryUri = await this.actions.waitForCreation({}, { parentCtx: ctx });

        await this.actions.patch(
          {
            resourceUri: dataRegistryUri,
            triplesToRemove: [
              rdf.quad(
                rdf.namedNode(dataRegistryUri),
                rdf.namedNode('http://www.w3.org/ns/solid/interop#hasDataRegistration'),
                rdf.namedNode(dataRegistrationUri)
              )
            ],
            webId: 'system'
          },
          { parentCtx: ctx }
        );
      }
    },

    awaitCreateComplete: {
      /**
       * Wait until all data registrations have been created for the newly-created user
       */
      async handler(ctx: any) {
        const { webId } = ctx.params;

        const containers = await ctx.call('ldp.registry.list');
        // @ts-expect-error TS(18046): 'container' is of type 'unknown'.
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
    }
  },
  events: {
    'registry-set.created': {
      async handler(ctx: any) {
        const { resourceUri: registrySetUri } = ctx.params;
        const dataRegistryUri = await this.actions.waitForCreation({}, { parentCtx: ctx });
        await ctx.call('ldp.resource.patch', {
          resourceUri: registrySetUri,
          triplesToAdd: [
            rdf.quad(
              rdf.namedNode(registrySetUri),
              rdf.namedNode('http://www.w3.org/ns/solid/interop#hasDataRegistry'),
              rdf.namedNode(dataRegistryUri)
            )
          ],
          webId: 'system'
        });
      }
    }
  }
} satisfies ServiceSchema;

export default DataRegistrySchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [DataRegistrySchema.name]: typeof DataRegistrySchema;
    }
  }
}
