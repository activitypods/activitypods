const urlJoin = require('url-join');
const { ControlledContainerMixin, isURL, arrayOf } = require('@semapps/ldp');

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
    excludeFromMirror: true,
    activateTombstones: false
  },
  dependencies: ['ldp', 'ldp.registry', 'pod'],
  actions: {
    put() {
      throw new Error(`The resources of type interop:DataGrant are immutable`);
    },
    patch() {
      throw new Error(`The resources of type interop:DataGrant are immutable`);
    },
    // Get all the DataGrants granted to an application
    async getForApp(ctx) {
      const { appUri, podOwner } = ctx.params;

      const containerUri = await this.actions.getContainerUri({ webId: podOwner }, { parentCtx: ctx });

      const filteredContainer = await this.actions.list(
        {
          containerUri,
          filters: {
            'http://www.w3.org/ns/solid/interop#dataOwner': podOwner,
            'http://www.w3.org/ns/solid/interop#grantee': appUri
          },
          webId: 'system'
        },
        { parentCtx: ctx }
      );

      return arrayOf(filteredContainer['ldp:contains']);
    },
    // Get the DataGrant linked with an AcccessNeed
    async getByAccessNeed(ctx) {
      const { accessNeedUri, podOwner } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#satisfiesAccessNeed': accessNeedUri,
            'http://www.w3.org/ns/solid/interop#dataOwner': podOwner
          },
          webId: podOwner
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0];
    },
    // Delete DataGrants which are not linked to an AccessNeed (may happen on app upgrade)
    async deleteOrphans(ctx) {
      const { appUri, podOwner } = ctx.params;
      const dataGrants = await this.actions.getForApp({ appUri, podOwner }, { parentCtx: ctx });
      for (const dataGrant of dataGrants) {
        try {
          await ctx.call('ldp.remote.get', { resourceUri: dataGrant['interop:satisfiesAccessNeed'] });
        } catch (e) {
          if (e.code === 404) {
            this.logger.info(`Deleting ${dataGrant.id} as it is not linked anymore with an existing access need...`);
            await this.actions.delete({ resourceUri: dataGrant.id, webId: podOwner });
          } else {
            throw e;
          }
        }
      }
    }
  },
  hooks: {
    before: {
      async post(ctx) {
        const { resource } = ctx.params;

        const webId = resource['interop:dataOwner'];
        const appUri = resource['interop:grantee'];
        const resourceType = resource['apods:registeredClass'];
        const accessMode = arrayOf(resource['interop:accessMode']);

        if (!isURL(resourceType))
          throw new Error(`DataGrant apods:registeredClass property must be a full URI. Received ${resourceType}`);

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

            // We only want to persist custom ontologies (not used by core services)
            await ctx.call('ontologies.register', { prefix, namespace, persist: true });

            ontology = { prefix, namespace };
          }
        }

        if (!ontology) throw new Error(`Could not register ontology for resource type ${resourceType}`);

        // Check if containers with this type already exist (happens if another app registered the same type)
        let containersUris = await this.broker.call('type-registrations.findContainersUris', {
          type: resourceType,
          webId
        });

        // If no container exist yet, create it and register it in the TypeIndex
        if (containersUris.length === 0) {
          // Generate a path for the new container
          const containerPath = await ctx.call('ldp.container.getPath', { resourceType });
          this.logger.debug(`Automatically generated the path ${containerPath} for resource type ${resourceType}`);

          // Create the container and attach it to its parent(s)
          const podUrl = await ctx.call('pod.getUrl', { webId });
          containersUris[0] = urlJoin(podUrl, containerPath);
          await ctx.call('ldp.container.createAndAttach', { containerUri: containersUris[0], webId });

          // If the resource type is invalid, an error will be thrown here
          await this.broker.call('type-registrations.register', {
            type: resourceType,
            containerUri: containersUris[0],
            webId
          });
        }

        await this.broker.call('type-registrations.bindApp', {
          type: resourceType,
          appUri,
          webId
        });

        for (const containerUri of containersUris) {
          // Give read-write permission to the application
          // For details, see https://github.com/assemblee-virtuelle/activitypods/issues/116
          await ctx.call('webacl.resource.addRights', {
            resourceUri: containerUri,
            additionalRights: {
              // Container rights
              user: {
                uri: appUri,
                read: accessMode.includes('acl:Read'),
                write: accessMode.includes('acl:Write')
              },
              // Resources default rights
              default: {
                user: {
                  uri: appUri,
                  read: accessMode.includes('acl:Read'),
                  append: accessMode.includes('acl:Append'),
                  write: accessMode.includes('acl:Write'),
                  control: accessMode.includes('acl:Control')
                }
              }
            },
            webId: 'system'
          });
        }

        // Persist the container URI so that the app doesn't need to fetch the whole TypeIndex
        ctx.params.resource['apods:registeredContainer'] = containersUris;
      }
    },
    after: {
      async delete(ctx, res) {
        const webId = res.oldData['interop:dataOwner'];
        const appUri = res.oldData['interop:grantee'];
        const resourceType = res.oldData['apods:registeredClass'];
        const accessMode = arrayOf(res.oldData['interop:accessMode']);

        await this.broker.call('type-registrations.unbindApp', {
          type: resourceType,
          appUri,
          webId
        });

        const containersUris = await ctx.call('type-registrations.findContainersUris', {
          type: res.oldData['apods:registeredClass'],
          webId
        });

        for (const containerUri of containersUris) {
          // Mirror of what is done on the above hook
          await ctx.call('webacl.resource.removeRights', {
            resourceUri: containerUri,
            rights: {
              user: {
                uri: appUri,
                read: accessMode.includes('acl:Read'),
                write: accessMode.includes('acl:Write')
              },
              default: {
                user: {
                  uri: appUri,
                  read: accessMode.includes('acl:Read'),
                  append: accessMode.includes('acl:Append'),
                  write: accessMode.includes('acl:Write'),
                  control: accessMode.includes('acl:Control')
                }
              }
            },
            webId: 'system'
          });
        }

        return res;
      }
    }
  }
};
