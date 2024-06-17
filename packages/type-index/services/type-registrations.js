const urlJoin = require('url-join');
const { ControlledContainerMixin } = require('@semapps/ldp');

module.exports = {
  name: 'type-registrations',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['solid:TypeRegistration']
  },
  actions: {
    async register(ctx) {
      const { webId, type } = ctx.params;

      const [expandedType] = await ctx.call('jsonld.parser.expandTypes', { types: [type] });

      // Check if a container was already registered with this type
      let containerUri = await this.actions.findContainerUri({ webId, type: expandedType });

      if (!containerUri) {
        // Generate a path for the new container
        const containerPath = await ctx.call('ldp.container.getPath', { resourceType: expandedType });
        this.logger.debug(`Automatically generated the path ${path} for resource type ${expandedType}`);

        // Create the container and attach it to its parent(s)
        containerUri = urlJoin(webId, 'data', containerPath);
        await ctx.call('ldp.container.createAndAttach', { containerUri, webId });

        // Find the Type Index linked with the WebId
        const indexUri = await ctx.call('type-indexes.findByWebId', { webId });
        if (!indexUri) throw new Error(`No public type index associated with webId ${webId}`);

        // Create the type registration
        const registrationUri = await this.actions.post(
          {
            resource: {
              type: 'solid:TypeRegistration',
              'solid:forClass': expandedType,
              'solid:instanceContainer': containerUri
            },
            webId
          },
          { parentCtx: ctx }
        );

        // Attach it to the Type Index
        await ctx.call('ldp.resource.patch', {
          resourceUri: indexUri,
          triplesToAdd: [
            triple(
              namedNode(indexUri),
              namedNode('http://www.w3.org/ns/solid/terms#hasTypeRegistration'),
              namedNode(registrationUri)
            )
          ],
          webId
        });
      }

      return containerUri;
    },
    async findContainerUri(ctx) {
      const { type, webId } = ctx.params;

      const [expandedType] = await ctx.call('jsonld.parser.expandTypes', { types: [type] });

      const dataset = getDatasetFromUri(webId);

      const results = await ctx.call('triplestore.query', {
        query: `
          PREFIX solid: <http://www.w3.org/ns/solid/terms#>
          SELECT ?containerUri
          WHERE {
            ?registration a solid:TypeRegistration .
            ?registration solid:forClass <${expandedType}> .
            ?registration solid:instanceContainer ?containerUri .
          }
        `,
        accept: MIME_TYPES.JSON,
        dataset,
        webId
      });

      return results[0]?.containerUri.value;
    }
  }
};
