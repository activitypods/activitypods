const urlJoin = require('url-join');
const { MIME_TYPES } = require('@semapps/mime-types');
const { getDatasetFromUri } = require('@semapps/ldp');

module.exports = {
  name: 'data-registrations',
  actions: {
    async generateFromShapeTree(ctx) {
      const { shapeTreeUri, podOwner } = ctx.params;

      const existingDataRegistration = await this.actions.getByShapeTree({ shapeTreeUri, podOwner });
      if (existingDataRegistration) return existingDataRegistration.id;

      // Get registered class from shapeTree
      const shapeTree = await ctx.call('shape-trees.get', { resourceUri: shapeTreeUri });
      const registeredClass = await ctx.call('shex.getType', { shapeUri: shapeTree['st:shape'] });
      if (!registeredClass) throw new Error(`Could not find class required by shape ${shapeTree['st:shape']}`);

      // Generate a path for the new container
      const containerPath = await ctx.call('ldp.container.getPath', { resourceType: registeredClass });

      // Create the container and attach it to its parent(s)
      const podUrl = await ctx.call('solid-storage.getUrl', { webId: podOwner });
      const containerUri = urlJoin(podUrl, containerPath);
      await ctx.call('ldp.container.createAndAttach', { containerUri, webId: podOwner });

      // Attach the DataRegistration predicates to the newly-created LDP container
      const authAgentUri = await ctx.call('auth-agent.getResourceUri', { webId: podOwner });
      const registeredAt = new Date().toISOString();
      await ctx.call('triplestore.update', {
        query: `
          PREFIX interop: <http://www.w3.org/ns/solid/interop#>
          PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
          INSERT {
            <${containerUri}> a interop:DataRegistration .
            <${containerUri}> interop:registeredBy <${podOwner}> . 
            <${containerUri}> interop:registeredWith <${authAgentUri}> .
            <${containerUri}> interop:registeredAt "${registeredAt}"^^xsd:dateTime .
            <${containerUri}> interop:updatedAt "${registeredAt}"^^xsd:dateTime .
            <${containerUri}> interop:registeredShapeTree <${shapeTreeUri}> .
          }
        `,
        accept: MIME_TYPES.JSON,
        webId: 'system',
        dataset: getDatasetFromUri(podOwner)
      });

      // If the resource type is invalid, an error will be thrown here
      await ctx.call('type-registrations.register', {
        type: registeredClass,
        containerUri,
        webId: podOwner
      });

      return containerUri;
    },
    // Get the DataRegistration linked with a shape tree
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
  }
};
