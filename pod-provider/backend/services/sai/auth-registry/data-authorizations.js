const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { arraysEqual } = require('../../../utils');
const ImmutableContainerMixin = require('../../../mixins/immutable-container-mixin');

module.exports = {
  name: 'data-authorizations',
  mixins: [ControlledContainerMixin, ImmutableContainerMixin],
  settings: {
    acceptedTypes: ['interop:DataAuthorization'],
    excludeFromMirror: true,
    activateTombstones: false,
    typeIndex: 'private'
  },
  actions: {
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

        const dataRegistrationUri = await ctx.call('data-registrations.generateFromShapeTree', {
          shapeTreeUri: accessNeed['interop:registeredShapeTree'],
          podOwner
        });

        const dataAuthorizationUri = await this.actions.post(
          {
            resource: {
              type: 'interop:DataAuthorization',
              'interop:dataOwner': podOwner,
              'interop:grantee': appUri,
              'interop:registeredShapeTree': accessNeed['interop:registeredShapeTree'],
              'interop:hasDataRegistration': dataRegistrationUri,
              'interop:accessMode': accessNeed['interop:accessMode'],
              'interop:scopeOfAuthorization': 'interop:All',
              'interop:satisfiesAccessNeed': accessNeedUri
            },
            contentType: MIME_TYPES.JSON
          },
          { parentCtx: ctx }
        );

        return dataAuthorizationUri;
      }
    },
    async generateForSingleResource(ctx) {
      const { resourceUri, grantee, accessModes, dataOwner } = ctx.params;

      const dataRegistrationUri = await ctx.call('data-registrations.getByResourceUri', {
        resourceUri,
        podOwner: dataOwner
      });

      // Get existing data authorizations
      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#dataOwner': dataOwner,
            'http://www.w3.org/ns/solid/interop#grantee': grantee,
            'http://www.w3.org/ns/solid/interop#hasDataRegistration': dataRegistrationUri,
            'http://www.w3.org/ns/solid/interop#scopeOfAuthorization':
              'http://www.w3.org/ns/solid/interop#SelectedFromRegistry'
          },
          webId: dataOwner
        },
        { parentCtx: ctx }
      );
      const dataAuthorizations = arrayOf(filteredContainer['ldp:contains']);

      // Check if a data authorization was already created for this resource
      const dataAuthorizationForResource = dataAuthorizations.find(auth =>
        arrayOf(auth['interop:hasDataInstance']).includes(resourceUri)
      );

      if (dataAuthorizationForResource) {
        if (arraysEqual(dataAuthorizationForResource['interop:accessMode'], accessModes)) {
          // If the same access mode was granted for this resource, skip it
          this.logger.warn(
            `Resource ${resourceUri} is already shared to ${grantee} with access modes ${accessModes.join(', ')}`
          );
          return dataAuthorizationForResource.id || dataAuthorizationForResource['@id'];
        } else {
          // If the access modes was changed, delete the authorization for the resource (it will be recreated below)
          await this.actions.deleteForSingleResource({ resourceUri, grantee, dataOwner });
        }
      }

      const dataAuthorizationForAccessModes = dataAuthorizations.find(auth =>
        arraysEqual(arrayOf(auth['interop:accessMode']), arrayOf(accessModes))
      );

      if (dataAuthorizationForAccessModes) {
        // If a data authorization exist with the same access modes, add the resource
        await this.actions.put(
          {
            resource: {
              ...dataAuthorizationForAccessModes,
              'interop:hasDataInstance': [
                ...arrayOf(dataAuthorizationForAccessModes['interop:hasDataInstance']),
                resourceUri
              ]
            },
            contentType: MIME_TYPES.JSON
          },
          { parentCtx: ctx }
        );
        return dataAuthorizationForAccessModes.id || dataAuthorizationForAccessModes['@id'];
      } else {
        const dataRegistration = await ctx.call('data-registrations.get', { dataRegistrationUri });
        const shapeTreeUri = dataRegistration['interop:registeredShapeTree'];

        const newDataAuthorizationUri = await this.actions.post(
          {
            resource: {
              type: 'interop:DataAuthorization',
              'interop:dataOwner': dataOwner,
              'interop:grantee': grantee,
              'interop:registeredShapeTree': shapeTreeUri,
              'interop:hasDataRegistration': dataRegistrationUri,
              'interop:hasDataInstance': resourceUri,
              'interop:accessMode': accessModes,
              'interop:scopeOfAuthorization': 'interop:SelectedFromRegistry'
            },
            contentType: MIME_TYPES.JSON
          },
          { parentCtx: ctx }
        );

        return newDataAuthorizationUri;
      }
    },
    async deleteForSingleResource(ctx) {
      const { resourceUri, grantee, dataOwner } = ctx.params;

      const dataRegistrationUri = await ctx.call('data-registrations.getByResourceUri', {
        resourceUri,
        podOwner: dataOwner
      });

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#dataOwner': dataOwner,
            'http://www.w3.org/ns/solid/interop#grantee': grantee,
            'http://www.w3.org/ns/solid/interop#hasDataRegistration': dataRegistrationUri,
            'http://www.w3.org/ns/solid/interop#scopeOfAuthorization':
              'http://www.w3.org/ns/solid/interop#SelectedFromRegistry'
          },
          webId: dataOwner
        },
        { parentCtx: ctx }
      );

      for (const dataAuthorization of arrayOf(filteredContainer['ldp:contains'])) {
        const resourcesUris = arrayOf(dataAuthorization['interop:hasDataInstance']);
        if (resourcesUris.includes(resourceUri)) {
          if (resourcesUris.length === 1) {
            // If the resource is the only one in the data authorization, delete it
            await this.actions.delete(
              {
                resourceUri: dataAuthorization.id || dataAuthorization['@id'],
                webId: dataOwner
              },
              { parentCtx: ctx }
            );
          } else {
            // If other resources are in the data authorization, remove it
            await this.actions.put(
              {
                resource: {
                  ...dataAuthorization,
                  'interop:hasDataInstance': resourcesUris.filter(uri => uri !== resourceUri)
                },
                contentType: MIME_TYPES.JSON,
                webId: dataOwner
              },
              { parentCtx: ctx }
            );
          }
        }
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
    // Get all the DataAuthorizations granted to an agent
    async getForAgent(ctx) {
      const { agentUri, podOwner } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#dataOwner': podOwner,
            'http://www.w3.org/ns/solid/interop#grantee': agentUri
          },
          webId: podOwner
        },
        { parentCtx: ctx }
      );

      return arrayOf(filteredContainer['ldp:contains']);
    },
    // Delete DataAuthorizations which are not linked anymore to an AccessNeed (may happen on app upgrade)
    async deleteOrphans(ctx) {
      const { appUri, podOwner } = ctx.params;
      const dataAuthorizations = await this.actions.getForAgent({ agentUri: appUri, podOwner }, { parentCtx: ctx });
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
        // For migration, we don't want to handle the following side-effects
        if (ctx.meta.isMigration === true) return;

        const { resource } = ctx.params;
        const podOwner = resource['interop:dataOwner'];
        const grantee = resource['interop:grantee'];
        const shapeTreeUri = resource['interop:registeredShapeTree'];
        const accessMode = arrayOf(resource['interop:accessMode']);
        const scope = resource['interop:scopeOfAuthorization'];

        const containerUri = await ctx.call('data-registrations.getByShapeTree', { shapeTreeUri, podOwner });

        // await this.broker.call('type-registrations.bindApp', {
        //   containerUri,
        //   appUri,
        //   webId: podOwner
        // });

        // For mapping details, see https://github.com/assemblee-virtuelle/activitypods/issues/116
        if (scope === 'interop:All') {
          // Give read-write permission to the whole container
          await ctx.call('webacl.resource.addRights', {
            resourceUri: containerUri,
            additionalRights: {
              // Container rights
              user: {
                uri: grantee,
                read: accessMode.includes('acl:Read'),
                write: accessMode.includes('acl:Write')
              },
              // Resources default rights
              default: {
                user: {
                  uri: grantee,
                  read: accessMode.includes('acl:Read'),
                  append: accessMode.includes('acl:Append'),
                  write: accessMode.includes('acl:Write'),
                  control: accessMode.includes('acl:Control')
                }
              }
            },
            webId: 'system'
          });
        } else if (scope === 'interop:SelectedFromRegistry') {
          for (const resourceUri of arrayOf(resource['interop:hasDataInstance'])) {
            // Give read-write permission to the resources
            await ctx.call('webacl.resource.addRights', {
              resourceUri: resourceUri,
              additionalRights: {
                // Container rights
                user: {
                  uri: grantee,
                  read: accessMode.includes('acl:Read'),
                  append: accessMode.includes('acl:Append'),
                  write: accessMode.includes('acl:Write'),
                  control: accessMode.includes('acl:Control')
                }
              },
              webId: 'system'
            });
          }
        }

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
        const podOwner = res.oldData['interop:dataOwner'];
        const appUri = res.oldData['interop:grantee'];
        const shapeTreeUri = res.oldData['interop:registeredShapeTree'];
        const accessMode = arrayOf(res.oldData['interop:accessMode']);
        const scope = res.oldData['interop:scopeOfAuthorization'];

        const containerUri = await ctx.call('data-registrations.getByShapeTree', { shapeTreeUri, podOwner });

        // In case of a migration, no container will be found so skip this part
        if (containerUri) {
          // await ctx.call('type-registrations.unbindApp', {
          //   containerUri,
          //   appUri,
          //   webId: podOwner
          // });

          // Mirror of what is done on the above hook
          if (scope === 'interop:All') {
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
          } else if (scope === 'interop:SelectedFromRegistry') {
            for (const resourceUri of arrayOf(res.oldData['interop:hasDataInstance'])) {
              await ctx.call('webacl.resource.removeRights', {
                resourceUri,
                rights: {
                  user: {
                    uri: appUri,
                    read: accessMode.includes('acl:Read'),
                    append: accessMode.includes('acl:Append'),
                    write: accessMode.includes('acl:Write'),
                    control: accessMode.includes('acl:Control')
                  }
                },
                webId: 'system'
              });
            }
          }
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
