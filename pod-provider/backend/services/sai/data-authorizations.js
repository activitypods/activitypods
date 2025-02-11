const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'data-authorizations',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:DataAuthorization'],
    excludeFromMirror: true,
    activateTombstones: false,
    typeIndex: 'private'
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

        const dataRegistrationUri = await ctx.call('data-registrations.generateFromShapeTree', {
          shapeTreeUri: accessNeed['interop:registeredShapeTree'],
          podOwner
        });

        const dataAuthorizationUri = await ctx.call('data-authorizations.post', {
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
        // For migration, we don't want to handle the following side-effects
        if (ctx.meta.isMigration === true) return;

        const { resource } = ctx.params;
        const podOwner = resource['interop:dataOwner'];
        const appUri = resource['interop:grantee'];
        const shapeTreeUri = resource['interop:registeredShapeTree'];
        const accessMode = arrayOf(resource['interop:accessMode']);

        const containerUri = await ctx.call('data-registrations.generateFromShapeTree', { shapeTreeUri, podOwner });

        // await this.broker.call('type-registrations.bindApp', {
        //   containerUri,
        //   appUri,
        //   webId: podOwner
        // });

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

        const containerUri = await ctx.call('data-registrations.getByShapeTree', { shapeTreeUri, podOwner });

        // In case of a migration, no container will be found so skip this part
        if (containerUri) {
          // await ctx.call('type-registrations.unbindApp', {
          //   containerUri,
          //   appUri,
          //   webId: podOwner
          // });

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
