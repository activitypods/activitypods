const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { arraysEqual } = require('../../../utils');

module.exports = {
  name: 'app-registrations',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:ApplicationRegistration'],
    newResourcesPermissions: {
      anon: {
        read: true
      }
    },
    excludeFromMirror: true,
    activateTombstones: false
  },
  actions: {
    async createOrUpdate(ctx) {
      const { appUri, podOwner, acceptedAccessNeeds, acceptedSpecialRights } = ctx.params;
      let accessGrantsUris = [];

      // First clean up orphans grants. This will remove all associated rights before they are added back below.
      await ctx.call('data-grants.deleteOrphans', { podOwner });
      await ctx.call('access-grants.deleteOrphans', { podOwner });

      // Get the app from the remote server, not the local cache
      const app = await ctx.call('ldp.remote.getNetwork', { resourceUri: appUri });

      for (const accessNeedGroupUri of arrayOf(app['interop:hasAccessNeedGroup'])) {
        const accessNeedGroup = await ctx.call('ldp.remote.get', { resourceUri: accessNeedGroupUri });
        let dataGrantsUris = [];
        let specialRightsUris = [];

        if (acceptedAccessNeeds) {
          for (const accessNeedUri of arrayOf(accessNeedGroup['interop:hasAccessNeed'])) {
            if (acceptedAccessNeeds.includes(accessNeedUri)) {
              const dataGrant = await ctx.call('data-grants.getByAccessNeed', { accessNeedUri, podOwner });
              if (dataGrant) {
                this.logger.info(`Found data grant ${dataGrant.id} linked with access need ${accessNeedUri}`);
                dataGrantsUris.push(dataGrant.id);
              } else {
                const accessNeed = await ctx.call('ldp.remote.get', { resourceUri: accessNeedUri });
                dataGrantsUris.push(
                  await ctx.call('data-grants.post', {
                    resource: {
                      type: 'interop:DataGrant',
                      'interop:dataOwner': podOwner,
                      'interop:grantee': appUri,
                      'apods:registeredClass': accessNeed['apods:registeredClass'],
                      'interop:accessMode': accessNeed['interop:accessMode'],
                      'interop:scopeOfGrant': 'interop:All',
                      'interop:satisfiesAccessNeed': accessNeedUri
                    },
                    contentType: MIME_TYPES.JSON
                  })
                );
              }
            }
          }
        }

        if (acceptedSpecialRights) {
          for (const specialRightUri of arrayOf(accessNeedGroup['apods:hasSpecialRights'])) {
            if (acceptedSpecialRights.includes(specialRightUri)) {
              specialRightsUris.push(specialRightUri);
            }
          }
        }

        // Only created the corresponding AccessGrant if a right was granted
        if (dataGrantsUris.length > 0 || specialRightsUris.length > 0) {
          const accessGrant = await ctx.call('access-grants.getByAccessNeedGroup', { accessNeedGroupUri, podOwner });
          if (
            accessGrant &&
            arraysEqual(accessGrant['interop:hasDataGrant'], dataGrantsUris) &&
            arraysEqual(accessGrant['apods:hasSpecialRights'], specialRightsUris)
          ) {
            this.logger.info(
              `Found access grant ${accessGrant.id} linked with access need group ${accessNeedGroupUri}`
            );
            accessGrantsUris.push(accessGrant.id);
          } else {
            if (accessGrant) {
              this.logger.info(`Deleting ${accessGrant.id} before recreating one as it does not grant the same rights`);
              await ctx.call('access-grants.delete', {
                resourceUri: accessGrant.id,
                webId: podOwner
              });
            }
            accessGrantsUris.push(
              await ctx.call('access-grants.post', {
                resource: {
                  type: 'interop:AccessGrant',
                  'interop:grantedBy': podOwner,
                  'interop:grantedAt': new Date().toISOString(),
                  'interop:grantee': appUri,
                  'interop:hasAccessNeedGroup': accessNeedGroupUri,
                  'interop:hasDataGrant': dataGrantsUris,
                  'apods:hasSpecialRights': specialRightsUris
                },
                contentType: MIME_TYPES.JSON
              })
            );
          }
        }
      }

      const appRegistration = await this.actions.getForApp({ appUri, podOwner }, { parentCtx: ctx });

      if (appRegistration) {
        await this.actions.put(
          {
            resource: {
              ...appRegistration,
              'interop:updatedAt': new Date().toISOString(),
              'interop:hasAccessGrant': accessGrantsUris
            },
            contentType: MIME_TYPES.JSON
          },
          { parentCtx: ctx }
        );

        return appRegistration.id;
      } else {
        const appRegistrationUri = await this.actions.post(
          {
            resource: {
              type: 'interop:ApplicationRegistration',
              'interop:registeredBy': podOwner,
              'interop:registeredAt': new Date().toISOString(),
              'interop:updatedAt': new Date().toISOString(),
              'interop:registeredAgent': appUri,
              'interop:hasAccessGrant': accessGrantsUris
            },
            contentType: MIME_TYPES.JSON
          },
          { parentCtx: ctx }
        );

        return appRegistrationUri;
      }
    },
    async getForApp(ctx) {
      const { appUri, podOwner } = ctx.params;

      const containerUri = await this.actions.getContainerUri({ webId: podOwner }, { parentCtx: ctx });

      const filteredContainer = await this.actions.list(
        {
          containerUri,
          filters: {
            'http://www.w3.org/ns/solid/interop#registeredAgent': appUri,
            'http://www.w3.org/ns/solid/interop#registeredBy': podOwner
          }
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0];
    },
    async isRegistered(ctx) {
      const { appUri, podOwner } = ctx.params;
      return !!(await this.actions.getForApp({ appUri, podOwner }, { parentCtx: ctx }));
    }
  },
  hooks: {
    after: {
      async post(ctx, res) {
        const appUri = ctx.params.resource['interop:registeredAgent'];
        const webId = ctx.params.resource['interop:registeredBy'];

        // Keep in cache the Application resource. This is useful for:
        // - Display the application details in the app store even if it's offline
        // - Known when the app must be upgraded by comparing the dc:modified predicate
        await ctx.call('ldp.remote.store', { resourceUri: appUri, webId });
        await ctx.call('applications.attach', { resourceUri: appUri, webId });

        return res;
      },
      async put(ctx, res) {
        // Update the Application resource kept in cache
        const appUri = ctx.params.resource['interop:registeredAgent'];
        const webId = ctx.params.resource['interop:registeredBy'];
        await ctx.call('ldp.remote.store', { resourceUri: appUri, webId });

        return res;
      },
      async delete(ctx, res) {
        const appRegistration = res.oldData;

        // DELETE ALL RELATED GRANTS

        for (const accessGrantUri of arrayOf(appRegistration['interop:hasAccessGrant'])) {
          const accessGrant = await ctx.call('access-grants.get', {
            resourceUri: accessGrantUri,
            webId: 'system'
          });

          for (const dataGrantUri of arrayOf(accessGrant['interop:hasDataGrant'])) {
            await ctx.call('data-grants.delete', {
              resourceUri: dataGrantUri,
              webId: 'system'
            });
          }

          await ctx.call('access-grants.delete', {
            resourceUri: accessGrantUri,
            webId: 'system'
          });
        }

        // DELETE APPLICATION RESOURCE KEPT IN CACHE

        await ctx.call('applications.delete', {
          resourceUri: appRegistration['interop:registeredAgent']
        });

        return res;
      }
    }
  }
};
