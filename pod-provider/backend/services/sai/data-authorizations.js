const urlJoin = require('url-join');
const { ControlledContainerMixin, isURL, arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'data-authorizations',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:DataAuthorization'],
    excludeFromMirror: true,
    activateTombstones: false,
    description: {
      labelMap: {
        en: 'Data Authorizations'
      },
      internal: true
    }
  },
  actions: {
    put() {
      throw new Error(`The resources of type interop:DataAuthorization are immutable`);
    },
    patch() {
      throw new Error(`The resources of type interop:DataAuthorization are immutable`);
    },
    /**
     * Generate a DataAuthorization based on a AccessNeed, unless it already exists
     */
    async generateFromAccessNeed(ctx) {
      const { accessNeedUri, podOwner, appUri } = ctx.params;

      // Check if a data authorization already exist for this access need
      const dataAuthorization = await this.actions.getByAccessNeed({ accessNeedUri, podOwner }, { parentCtx: ctx });

      if (dataAuthorization) {
        this.logger.info(`Found data authorization ${dataAuthorization.id} linked with access need ${accessNeedUri}`);
        return dataAuthorization.id;
      } else {
        const accessNeed = await ctx.call('ldp.remote.get', { resourceUri: accessNeedUri });

        // The data-grants.post before hook requires an expanded type. Expand it now since we have the context.
        const [expandedRegisteredClass] = await ctx.call('jsonld.parser.expandTypes', {
          types: [accessNeed['apods:registeredClass']],
          context: accessNeed['@context']
        });

        const dataAuthorizationUri = await ctx.call('data-authorizations.post', {
          resource: {
            type: 'interop:DataAuthorization',
            'interop:dataOwner': podOwner,
            'interop:grantee': appUri,
            'apods:registeredClass': expandedRegisteredClass,
            'interop:accessMode': accessNeed['interop:accessMode'],
            'interop:scopeOfAuthorization': 'interop:All',
            'interop:satisfiesAccessNeed': accessNeedUri
          },
          contentType: MIME_TYPES.JSON
        });

        return dataAuthorizationUri;
      }
    },
    // Get the DataAuthorization linked with an AccessNeed
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
    // Get all the DataAuthorizations granted to an application
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
    /**
     * Create the container if it doesn't exist yet for the given class
     * If the ontology is not registered yet, register it (and persist it)
     */
    async createContainerFromClass(ctx) {
      const { podOwner, registeredClass } = ctx.params;

      if (!isURL(registeredClass))
        throw new Error(
          `DataAuthorization apods:registeredClass property must be a full URI. Received ${registeredClass}`
        );

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

      // Check if containers with this type already exist (happens if another app registered the same type)
      let containersUris = await this.broker.call('type-registrations.findContainersUris', {
        type: registeredClass,
        webId: podOwner
      });

      // If no container exist yet, create it and register it in the TypeIndex
      if (containersUris.length === 0) {
        // Generate a path for the new container
        const containerPath = await ctx.call('ldp.container.getPath', { resourceType: registeredClass });
        this.logger.debug(`Automatically generated the path ${containerPath} for resource type ${registeredClass}`);

        // Create the container and attach it to its parent(s)
        const podUrl = await ctx.call('solid-storage.getUrl', { webId: podOwner });
        containersUris[0] = urlJoin(podUrl, containerPath);
        await ctx.call('ldp.container.createAndAttach', { containerUri: containersUris[0], webId: podOwner });

        // If the resource type is invalid, an error will be thrown here
        await this.broker.call('type-registrations.register', {
          type: registeredClass,
          containerUri: containersUris[0],
          webId: podOwner
        });
      }

      return containersUris;
    },
    // Delete DataAuthorizations which are not linked anymore to an AccessNeed (may happen on app upgrade)
    async deleteOrphans(ctx) {
      const { appUri, podOwner } = ctx.params;
      const dataAuthorizations = await this.actions.getForApp({ appUri, podOwner }, { parentCtx: ctx });
      for (const dataAuthorization of dataAuthorizations) {
        try {
          await ctx.call('ldp.remote.get', { resourceUri: dataAuthorization['interop:satisfiesAccessNeed'] });
        } catch (e) {
          if (e.code === 404) {
            this.logger.info(
              `Deleting data authorization ${dataAuthorization.id} as it is not linked anymore with an existing access need...`
            );
            await this.actions.delete({ resourceUri: dataAuthorization.id, webId: podOwner });
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

        const podOwner = resource['interop:dataOwner'];
        const appUri = resource['interop:grantee'];
        const registeredClass = resource['apods:registeredClass'];

        const accessMode = arrayOf(resource['interop:accessMode']);

        const containersUris = await this.actions.createContainerFromClass(
          { podOwner, registeredClass },
          { parentCtx: ctx }
        );

        await this.broker.call('type-registrations.bindApp', {
          type: registeredClass,
          appUri,
          webId: podOwner
        });

        // Give read-write permission to the application
        // For details, see https://github.com/assemblee-virtuelle/activitypods/issues/116
        for (const containerUri of containersUris) {
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

        // Create a DataGrant with the same data, but replace interop:scopeOfAuthorization with interop:scopeOfGrant
        await ctx.call('data-grants.post', {
          resource: {
            ...ctx.params.resource,
            type: 'interop:DataGrant',
            'interop:scopeOfGrant': ctx.params.resource['interop:scopeOfAuthorization'],
            'interop:scopeOfAuthorization': undefined
          },
          contentType: MIME_TYPES.JSON
        });
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

        // Delete DataGrant that match the same AccessNeed
        const dataGrant = await ctx.call('data-grants.getByAccessNeed', {
          accessNeedUri: res.oldData['interop:satisfiesAccessNeed'],
          podOwner: res.oldData['interop:dataOwner']
        });
        if (dataGrant) {
          await ctx.call('data-grants.delete', {
            resourceUri: dataGrant.id,
            webId: 'system'
          });
        }

        return res;
      }
    }
  }
};
