// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { MIME_TYPES } from '@semapps/mime-types';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { getDatasetFromUri, hasType, isURL } from '@semapps/ldp';
import { ServiceSchema, defineAction, defineServiceEvent } from 'moleculer';

const DataRegistrationsServiceSchema = {
  name: 'data-registrations' as const,

  actions: {
    generateFromShapeTree: defineAction({
      /**
       * Create a DataRegistration AND a LDP container in a given storage
       */
      // @ts-expect-error TS(7023): 'generateFromShapeTree' implicitly has return type... Remove this comment to see the full error message
      async handler(ctx: any) {
        const { shapeTreeUri, podOwner } = ctx.params;

        // @ts-expect-error TS(7022): 'existingDataRegistration' implicitly has type 'an... Remove this comment to see the full error message
        const existingDataRegistration = await this.actions.getByShapeTree({ shapeTreeUri, podOwner });
        if (existingDataRegistration) return existingDataRegistration;

        // Get registered class from shapeTree
        const shapeUri = await ctx.call('shape-trees.getShapeUri', { resourceUri: shapeTreeUri });
        if (!shapeUri) throw new Error(`Could not find shape from shape tree ${shapeTreeUri}`);
        const [registeredClass] = await ctx.call('shacl.getTypes', { resourceUri: shapeUri });
        if (!registeredClass) throw new Error(`Could not find class required by shape ${shapeUri}`);

        // Register ontology, otherwise the ldp.container.getPath action will fail
        // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ gener... Remove this comment to see the full error message
        await this.actions.registerOntologyFromClass({ registeredClass }, { parentCtx: ctx });

        // Generate a path for the new container
        const containerPath = await ctx.call('ldp.container.getPath', { resourceType: registeredClass });

        // Create the container and attach it to its parent(s)
        const podUrl = await ctx.call('solid-storage.getUrl', { webId: podOwner });
        const containerUri = urlJoin(podUrl, containerPath);
        await ctx.call('ldp.container.createAndAttach', { containerUri, webId: podOwner });

        // Register the class on the type index
        await ctx.call('type-registrations.register', {
          types: [registeredClass],
          containerUri,
          webId: podOwner,
          private: false
        });

        // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ gener... Remove this comment to see the full error message
        await this.actions.attachToContainer({ shapeTreeUri, containerUri, podOwner }, { parentCtx: ctx });

        return containerUri;
      }
    }),

    attachToContainer: defineAction({
      /**
       * Attach the DataRegistration predicates to an existing LDP container
       */
      async handler(ctx: any) {
        const { shapeTreeUri, containerUri, podOwner } = ctx.params;

        const container = await ctx.call('ldp.container.get', {
          containerUri,
          accept: MIME_TYPES.JSON,
          webId: 'system',
          doNotIncludeResources: true
        });

        const currentData = new Date().toISOString();

        if (hasType(container, 'interop:DataRegistration')) {
          // Only update the DataRegistration if the shapeTreeUri is different
          if (shapeTreeUri !== container['interop:registeredShapeTree']) {
            await ctx.call('triplestore.update', {
              query: `
                PREFIX interop: <http://www.w3.org/ns/solid/interop#>
                PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
                DELETE {
                  <${containerUri}> interop:updatedAt ?updatedAt .
                  <${containerUri}> interop:registeredShapeTree ?shapeTree .
                } 
                INSERT {
                  <${containerUri}> interop:updatedAt "${currentData}"^^xsd:dateTime .
                  <${containerUri}> interop:registeredShapeTree <${shapeTreeUri}> .
                }
                WHERE {
                  <${containerUri}> interop:updatedAt ?updatedAt .
                  <${containerUri}> interop:registeredShapeTree ?shapeTree .
                }
              `,
              accept: MIME_TYPES.JSON,
              webId: 'system',
              dataset: getDatasetFromUri(podOwner)
            });
          }
        } else {
          const authAgentUri = await ctx.call('auth-agent.waitForResourceCreation', { webId: podOwner });

          await ctx.call('triplestore.update', {
            query: `
              PREFIX interop: <http://www.w3.org/ns/solid/interop#>
              PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
              INSERT DATA {
                <${containerUri}> a interop:DataRegistration .
                <${containerUri}> interop:registeredBy <${podOwner}> . 
                <${containerUri}> interop:registeredWith <${authAgentUri}> .
                <${containerUri}> interop:registeredAt "${currentData}"^^xsd:dateTime .
                <${containerUri}> interop:updatedAt "${currentData}"^^xsd:dateTime .
                <${containerUri}> interop:registeredShapeTree <${shapeTreeUri}> .
              }
            `,
            accept: MIME_TYPES.JSON,
            webId: 'system',
            dataset: getDatasetFromUri(podOwner)
          });
        }

        // Attach the DataRegistration to the DataRegistry
        await ctx.call('data-registry.add', {
          podOwner,
          dataRegistrationUri: containerUri
        });

        // @ts-expect-error TS(2339): Property 'broker' does not exist on type '{ genera... Remove this comment to see the full error message
        if (this.broker.cacher) {
          // We don't want to invalidate the cache of all resources within the container, so consider the container like a resource
          await ctx.call('ldp.cache.invalidateResource', { resourceUri: containerUri });
        }
      }
    }),

    getByShapeTree: defineAction({
      /**
       * Get the DataRegistration linked with a shape tree
       */
      async handler(ctx: any) {
        const { shapeTreeUri, podOwner } = ctx.params;

        const results = await ctx.call('triplestore.query', {
          query: `
            PREFIX interop: <http://www.w3.org/ns/solid/interop#>
            SELECT ?dataRegistrationUri
            WHERE {
              ?dataRegistrationUri interop:registeredShapeTree <${shapeTreeUri}> .
              ?dataRegistrationUri interop:registeredBy <${podOwner}> .
              ?dataRegistrationUri a interop:DataRegistration .
            }
          `,
          accept: MIME_TYPES.JSON,
          webId: 'system',
          dataset: getDatasetFromUri(podOwner)
        });

        return results[0]?.dataRegistrationUri?.value;
      }
    }),

    registerOntologyFromClass: defineAction({
      async handler(ctx: any) {
        const { registeredClass } = ctx.params;

        // Match a string of type ldp:Container
        const regex = /^([^:]+):([^:]+)$/gm;

        // Find if the ontology is already registered
        let ontology;
        if (isURL(registeredClass)) {
          ontology = await ctx.call('ontologies.get', { uri: registeredClass });
        } else if (registeredClass.match(regex)) {
          const matchResults = regex.exec(registeredClass);
          // @ts-expect-error TS(2531): Object is possibly 'null'.
          ontology = await ctx.call('ontologies.get', { prefix: matchResults[1] });
        } else {
          throw new Error(`Registered class must be an URI or prefixed. Received ${registeredClass}`);
        }

        if (!ontology) {
          const prefix = await ctx.call('ontologies.findPrefix', { uri: registeredClass });

          if (prefix) {
            const namespace = await ctx.call('ontologies.findNamespace', { prefix });

            // We only want to persist custom ontologies (not used by core services)
            await ctx.call('ontologies.register', { prefix, namespace, persist: true });

            ontology = { prefix, namespace };
          }
        }

        if (!ontology) throw new Error(`Could not register ontology for resource type ${registeredClass}`);

        return ontology;
      }
    })
  },

  events: {
    'ldp.container.created': defineServiceEvent({
      async handler(ctx: any) {
        const { containerUri, options, webId } = ctx.params;

        // If a shape tree is in the container option of the newly-created container, attach
        if (options?.shapeTreeUri) {
          // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ 'ldp.... Remove this comment to see the full error message
          await this.actions.attachToContainer(
            {
              shapeTreeUri: options.shapeTreeUri,
              containerUri,
              podOwner: webId
            },
            { parentCtx: ctx }
          );
        }
      }
    })
  }
} satisfies ServiceSchema;

export default DataRegistrationsServiceSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [DataRegistrationsServiceSchema.name]: typeof DataRegistrationsServiceSchema;
    }
  }
}
