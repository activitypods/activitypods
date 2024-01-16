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

        const baseUrl = await ctx.call('ldp.getBaseUrl');

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

        // If the resource type is invalid, an error will be thrown here
        // const containerPath = await ctx.call('ldp.container.getPath', { resourceType });

        const containerRegistration = await this.broker.call('ldp.registry.register', {
          acceptedTypes: resourceType,
          permissions: {
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
          dataset
        });

        ctx.params.resource['apods:registeredContainer'] = urlJoin(
          baseUrl,
          dataset,
          'data',
          containerRegistration.path
        );
        // const ontologyContainerUri = getParentContainerUri(containerUri);
        // const rootContainerUri = getParentContainerUri(ontologyContainerUri);

        // // Create the parent container (ontology container) if necessary

        // if (!(await ctx.call('ldp.container.exist', { containerUri: ontologyContainerUri, webId: 'system' }))) {
        //   await ctx.call('ldp.container.create', {
        //     containerUri: ontologyContainerUri,
        //     webId: 'system'
        //   });

        //   await ctx.call('ldp.container.attach', {
        //     containerUri: rootContainerUri,
        //     resourceUri: ontologyContainerUri,
        //     webId: 'system'
        //   });
        // }

        // // Create the container if necessary
        // if (!(await ctx.call('ldp.container.exist', { containerUri, webId: 'system' }))) {
        //   await ctx.call('ldp.container.create', {
        //     containerUri,
        //     webId: 'system'
        //   });

        //   await ctx.call('ldp.container.attach', {
        //     containerUri: ontologyContainerUri,
        //     resourceUri: containerUri,
        //     webId: 'system'
        //   });
        // }

        // // Give read-write permission to the application
        // // TODO adapt to requested permissions
        // await ctx.call('webacl.resource.addRights', {
        //   resourceUri: containerUri,
        //   additionalRights: {
        //     user: {
        //       uri: appUri,
        //       read: true,
        //       write: true
        //     },
        //     default: {
        //       user: {
        //         uri: appUri,
        //         read: true,
        //         write: true
        //       }
        //     }
        //   },
        //   webId: 'system'
        // });
      }
    }
  }
};
