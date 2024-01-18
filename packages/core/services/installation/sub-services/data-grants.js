const urlJoin = require('url-join');
const { ControlledContainerMixin, isURL, getSlugFromUri } = require('@semapps/ldp');

module.exports = {
  name: 'data-grants',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:DataGrant'],
    newResourcesPermissions: {
      anon: {
        read: true
      }
    },
    excludeFromMirror: true
  },
  dependencies: ['ldp', 'ldp.registry', 'pod'],
  async started() {
    const baseUrl = await this.broker.call('ldp.getBaseUrl');
    for (let dataset of await this.broker.call('pod.list')) {
      const results = await this.actions.list({});
      for (const dataGrant of results.rows) {
        await this.broker.call('ldp.registry.register', {
          path: dataGrant['apods:registeredContainer'].replace(baseUrl, ''),
          acceptedTypes: dataGrant['apods:registeredClass'],
          dataset
        });
      }
    }
  },
  hooks: {
    before: {
      async post(ctx) {
        const { resource } = ctx.params;

        const webId = resource['interop:dataOwner'];
        const dataset = getSlugFromUri(webId);
        const appUri = resource['interop:grantee'];
        const resourceType = resource['apods:registeredClass'];

        // Match a string of type ldp:Container
        const regex = /^([^:]+):([^:]+)$/gm;

        let ontology;
        if (isURL(resourceType)) {
          ontology = await ctx.call('ontologies.get', { uri: resourceType });
        } else if (resourceType.match(regex)) {
          const matchResults = regex.exec(resourceType);
          ontology = await ctx.call('ontologies.get', { prefix: matchResults[1] });
        } else {
          throw new Error(`Registered class must be an URI or prefixed. Received ${resourceType}`);
        }

        if (!ontology) {
          const prefix = await ctx.call('ontologies.findPrefix', { uri: resourceType });

          if (prefix) {
            const namespace = await ctx.call('ontologies.findNamespace', { prefix });

            await ctx.call('ontologies.register', { prefix, namespace });

            ontology = { prefix, namespace };
          }
        }

        if (!ontology) throw new Error(`Could not register ontology for resource type ${resourceType}`);

        // Check if a container registration already exist for this type (happens if another app registered the same type)
        let containerRegistration = await this.broker.call('ldp.registry.getByType', {
          type: resourceType,
          dataset
        });

        if (!containerRegistration) {
          // If the resource type is invalid, an error will be thrown here
          containerRegistration = await this.broker.call('ldp.registry.register', {
            acceptedTypes: resourceType,
            dataset
          });
        }

        const containerUri = await this.broker.call('ldp.registry.getUri', { path: containerRegistration.path, webId });

        // Give read-write permission to the application
        // TODO adapt to requested permissions
        await ctx.call('webacl.resource.addRights', {
          resourceUri: containerUri,
          additionalRights: {
            user: {
              uri: appUri,
              read: true,
              write: true
            },
            default: {
              user: {
                uri: appUri,
                read: true,
                write: true
              }
            }
          },
          webId: 'system'
        });

        ctx.params.resource['apods:registeredContainer'] = containerUri;
      }
    }
  }
};
