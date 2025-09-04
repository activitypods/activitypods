import urlJoin from 'url-join';
import LinkHeader from 'http-link-header';
const { MoleculerError } = require('moleculer').Errors;
import { MIME_TYPES } from '@semapps/mime-types';
import { getDatasetFromUri, hasType, isURL } from '@semapps/ldp';
import { ServiceSchema } from 'moleculer';

const DataRegistrationsSchema = {
  name: 'data-registrations' as const,
  dependencies: ['ldp.link-header'],
  async started() {
    await this.broker.call('ldp.link-header.register', { actionName: 'data-registrations.getLink' });
  },
  actions: {
    get: {
      async handler(ctx) {
        const { dataRegistrationUri } = ctx.params;

        return await ctx.call(
          'ldp.container.get',
          {
            containerUri: dataRegistrationUri,
            accept: MIME_TYPES.JSON,
            webId: 'system',
            doNotIncludeResources: true
          },
          {
            meta: {
              dataset: getDatasetFromUri(dataRegistrationUri)
            }
          }
        );
      }
    },

    generateFromShapeTree: {
      /**
       * Create a DataRegistration AND a LDP container in a given storage
       */
      async handler(ctx) {
        const { shapeTreeUri, podOwner } = ctx.params;

        const existingDataRegistration = await this.actions.getByShapeTree({ shapeTreeUri, podOwner });
        if (existingDataRegistration) return existingDataRegistration;

        // Get registered class from shapeTree
        const shapeUri = await ctx.call('shape-trees.getShapeUri', { resourceUri: shapeTreeUri });
        if (!shapeUri) throw new Error(`Could not find shape from shape tree ${shapeTreeUri}`);
        const [registeredClass] = await ctx.call('shacl.getTypes', { resourceUri: shapeUri });
        if (!registeredClass) throw new Error(`Could not find class required by shape ${shapeUri}`);

        // Register ontology, otherwise the ldp.container.getPath action will fail
        await this.actions.registerOntologyFromClass({ registeredClass }, { parentCtx: ctx });

        // Generate a path for the new container
        const containerPath = await ctx.call('ldp.container.getPath', { resourceType: registeredClass });

        // Create the container and attach it to its parent(s)
        const podUrl = await ctx.call('solid-storage.getUrl', { webId: podOwner });
        const containerUri = urlJoin(podUrl, containerPath);
        await ctx.call('ldp.container.createAndAttach', { containerUri, webId: podOwner });

        // Register the class on the type index
        const services = await this.broker.call('$node.services');
        if (services.some((s: any) => s.name === 'type-registrations')) {
          await ctx.call('type-registrations.register', {
            types: [registeredClass],
            containerUri,
            webId: podOwner,
            private: false
          });
        }

        await this.actions.attachToContainer({ shapeTreeUri, containerUri, podOwner }, { parentCtx: ctx });

        return containerUri;
      }
    },

    attachToContainer: {
      /**
       * Attach the DataRegistration predicates to an existing LDP container
       */
      async handler(ctx) {
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

        if (this.broker.cacher) {
          // We don't want to invalidate the cache of all resources within the container, so consider the container like a resource
          await ctx.call('ldp.cache.invalidateResource', { resourceUri: containerUri });
        }
      }
    },

    getByShapeTree: {
      /**
       * Get the DataRegistration URI linked with a shape tree
       */
      async handler(ctx) {
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
    },

    getUriByResourceUri: {
      /**
       * Get the data registration URI of a resource
       */
      async handler(ctx) {
        const { resourceUri } = ctx.params;
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.params.webId || ctx.meta.webId;

        const baseUrl = await ctx.call('ldp.getBaseUrl');

        if (resourceUri.startsWith(baseUrl)) {
          const results = await ctx.call('triplestore.query', {
            query: `
              PREFIX ldp: <http://www.w3.org/ns/ldp#>
              PREFIX interop: <http://www.w3.org/ns/solid/interop#>
              SELECT ?dataRegistrationUri
              WHERE {
                ?dataRegistrationUri ldp:contains <${resourceUri}> .
                ?dataRegistrationUri a interop:DataRegistration .
              }
            `,
            accept: MIME_TYPES.JSON,
            webId: 'system',
            dataset: getDatasetFromUri(resourceUri)
          });

          return results[0]?.dataRegistrationUri?.value;
        } else {
          if (!webId)
            throw new Error(`A webId is required to find the data registration of remote resource ${resourceUri}`);

          const response = await ctx.call('signature.proxy.query', {
            url: resourceUri,
            method: 'HEAD',
            actorUri: webId
          });

          const linkHeader = LinkHeader.parse(response.headers.link);
          const dataRegistrationLinkHeader = linkHeader.rel('http://www.w3.org/ns/solid/interop#hasDataRegistration');

          if (dataRegistrationLinkHeader.length > 0) {
            return dataRegistrationLinkHeader[0].uri;
          }
        }
      }
    },

    getByResourceUri: {
      /**
       * Get the data registration of a resource
       */
      async handler(ctx) {
        const { resourceUri } = ctx.params;
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.params.webId || ctx.meta.webId;

        const dataRegistrationUri = await this.actions.getUriByResourceUri({ resourceUri, webId }, { parentCtx: ctx });

        if (dataRegistrationUri) {
          return await this.actions.get({ dataRegistrationUri }, { parentCtx: ctx });
        } else {
          throw new MoleculerError(
            // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
            `Data registration not found for resource ${resourceUri} (webId ${webId}, dataset ${ctx.meta.dataset})`,
            404,
            'NOT_FOUND'
          );
        }
      }
    },

    registerOntologyFromClass: {
      async handler(ctx) {
        const { registeredClass } = ctx.params;

        // Match a string of type ldp:Container
        const regex = /^([^:]+):([^:]+)$/gm;

        // Find if the ontology is already registered
        let ontology;
        if (isURL(registeredClass)) {
          ontology = await ctx.call('ontologies.get', { uri: registeredClass });
        } else if (registeredClass.match(regex)) {
          const matchResults = regex.exec(registeredClass);
          // @ts-expect-error TS(18047): 'matchResults' is possibly 'null'.
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
    },

    getLink: {
      async handler(ctx) {
        const { uri } = ctx.params;

        const dataRegistrationUri = await this.actions.getUriByResourceUri({ resourceUri: uri }, { parentCtx: ctx });

        if (dataRegistrationUri) {
          return {
            uri: dataRegistrationUri,
            rel: 'http://www.w3.org/ns/solid/interop#hasDataRegistration'
          };
        }
      }
    }
  },
  events: {
    'ldp.container.created': {
      async handler(ctx) {
        // @ts-expect-error TS(2339): Property 'containerUri' does not exist on type 'Op... Remove this comment to see the full error message
        const { containerUri, options, webId } = ctx.params;

        // If a shape tree is in the container option of the newly-created container, attach
        if (options?.shapeTreeUri) {
          // @ts-expect-error TS(2339): Property 'actions' does not exist on type 'Service... Remove this comment to see the full error message
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
    }
  }
} satisfies ServiceSchema;

export default DataRegistrationsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [DataRegistrationsSchema.name]: typeof DataRegistrationsSchema;
    }
  }
}
