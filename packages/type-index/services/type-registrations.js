const urlJoin = require('url-join');
const { namedNode, triple } = require('@rdfjs/data-model');
const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'type-registrations',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['solid:TypeRegistration'],
    permissions: {
      default: {
        anon: {
          read: true
        }
      }
    },
    excludeFromMirror: true
  },
  actions: {
    register: {
      visibility: 'public',
      params: {
        type: { type: 'string' },
        containerUri: { type: 'string' },
        webId: { type: 'string' }
      },
      async handler(ctx) {
        let { type, containerUri, label, labelPredicate, openEndpoint, webId } = ctx.params;

        const [expandedType] = await ctx.call('jsonld.parser.expandTypes', { types: [type] });

        // Check if the container was already registered
        let existingRegistration = await this.actions.getByContainerUri({ containerUri, webId });

        if (existingRegistration) {
          const expandedRegisteredTypes = await ctx.call('jsonld.parser.expandTypes', {
            types: existingRegistration['solid:forClass']
          });

          // If the container is registered with other types, append the new type
          if (!expandedRegisteredTypes.includes(expandedType)) {
            await this.actions.patch({
              resourceUri: existingRegistration.id,
              triplesToAdd: [
                triple(
                  namedNode(existingRegistration.id),
                  namedNode('http://www.w3.org/ns/solid/terms#forClass'),
                  namedNode(expandedType)
                )
              ],
              webId
            });
          }

          return existingRegistration;
        } else {
          // Ensure there is no registration for this type on another container
          // existingRegistration = await this.actions.getByType({ type: expandedType, webId });

          // if (existingRegistration && existingRegistration['solid:instanceContainer'] !== containerUri) {
          //   throw new Error(
          //     `Cannot register ${containerUri} for type ${type} because the container ${existingRegistration['solid:instanceContainer']} is already registered for this type.`
          //   );
          // }

          // Find the TypeIndex linked with the WebId
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
              contentType: MIME_TYPES.JSON,
              webId
            },
            { parentCtx: ctx }
          );

          // Attach it to the TypeIndex
          await ctx.call('type-indexes.patch', {
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

          return registrationUri;
        }
      }
    },
    registerApp: {
      visibility: 'public',
      params: {
        type: { type: 'string' },
        containerUri: { type: 'string' },
        webId: { type: 'string' }
      },
      async handler(ctx) {}
    },
    getByType: {
      visibility: 'public',
      params: {
        type: { type: 'string' },
        webId: { type: 'string' }
      },
      async handler(ctx) {
        const { type, webId } = ctx.params;

        const [expandedType] = await ctx.call('jsonld.parser.expandTypes', { types: [type] });

        const filteredContainer = await this.actions.list(
          {
            filters: { 'http://www.w3.org/ns/solid/terms#forClass': expandedType },
            webId
          },
          { parentCtx: ctx }
        );

        // There can be several TypeRegistration per type
        return arrayOf(filteredContainer['ldp:contains']);
      }
    },
    getByContainerUri: {
      visibility: 'public',
      params: {
        containerUri: { type: 'string' },
        webId: { type: 'string' }
      },
      async handler(ctx) {
        const { containerUri, webId } = ctx.params;

        const filteredContainer = await this.actions.list(
          {
            filters: { 'http://www.w3.org/ns/solid/terms#instanceContainer': containerUri },
            webId
          },
          { parentCtx: ctx }
        );

        // There should be only one TypeRegistration per container
        return arrayOf(filteredContainer['ldp:contains'])[0];
      }
    },
    findContainersUris: {
      visibility: 'public',
      params: {
        type: { type: 'string' },
        webId: { type: 'string' }
      },
      async handler(ctx) {
        const { type, webId } = ctx.params;

        const registrations = await this.actions.getByType({ type, webId });

        return registrations.map(r => r['solid:instanceContainer']);
      }
    },
    addMissing: {
      visibility: 'public',
      async handler(ctx) {
        const accounts = await ctx.call('auth.account.find');
        const registeredContainers = await ctx.call('ldp.registry.list');
        // Go through each Pod
        for (const { webId, podUri } of accounts) {
          // Go through each registered container
          for (const container of Object.values(registeredContainers)) {
            if (container.podsContainer !== true) {
              const containerUri = urlJoin(podUri, container.path);
              for (const type of arrayOf(container.acceptedTypes)) {
                await this.actions.register({ type, containerUri, webId }, { parentCtx: ctx });
              }
            }
          }
        }
      }
    }
  }
};
