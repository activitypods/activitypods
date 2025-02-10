const urlJoin = require('url-join');
const { MIME_TYPES } = require('@semapps/mime-types');
const { getDatasetFromUri, hasType } = require('@semapps/ldp');

module.exports = {
  name: 'data-registrations',
  actions: {
    /**
     * Create a DataRegistration AND a LDP container in a given storage
     */
    async generateFromShapeTree(ctx) {
      const { shapeTreeUri, podOwner } = ctx.params;

      const existingDataRegistration = await this.actions.getByShapeTree({ shapeTreeUri, podOwner });
      if (existingDataRegistration) return existingDataRegistration;

      // Get registered class from shapeTree
      const shapeTree = await ctx.call('shape-trees.get', { resourceUri: shapeTreeUri });
      const shapeUri = shapeTree[0]['http://www.w3.org/ns/shapetrees#shape']?.[0]?.['@id'];
      if (!shapeUri) throw new Error(`Could not find shape from shape tree ${shapeTreeUri}`);
      const registeredClass = await ctx.call('shex.getType', { shapeUri });
      if (!registeredClass) throw new Error(`Could not find class required by shape ${shapeUri}`);

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
        webId,
        private: false
      });

      await this.actions.attachToContainer({ shapeTreeUri, containerUri, podOwner }, { parentCtx: ctx });

      return containerUri;
    },
    /**
     * Attach the DataRegistration predicates to an existing LDP container
     */
    async attachToContainer(ctx) {
      const { shapeTreeUri, containerUri, podOwner } = ctx.params;

      const container = await ctx.call('ldp.container.get', { containerUri, accept: MIME_TYPES.JSON, webId: 'system' });

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

      if (this.broker.cacher) {
        // We don't want to invalidate the cache of all resources within the container, so consider the container like a resource
        await ctx.call('ldp.cache.invalidateResource', { resourceUri: containerUri });
      }
    },
    /**
     * Get the DataRegistration linked with a shape tree
     */
    async getByShapeTree(ctx) {
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
    },
    async registerOntologyFromClass() {
      const { registeredClass } = ctx.params;

      // Match a string of type ldp:Container
      const regex = /^([^:]+):([^:]+)$/gm;

      // Find if the ontology is already registered
      let ontology;
      if (isURL(registeredClass)) {
        ontology = await ctx.call('ontologies.get', { uri: registeredClass });
      } else if (registeredClass.match(regex)) {
        const matchResults = regex.exec(registeredClass);
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
  events: {
    async 'ldp.container.created'(ctx) {
      const { containerUri, options, webId } = ctx.params;

      // If a shape tree is in the container option of the newly-created container, attach
      if (options?.shapeTreeUri) {
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
};
