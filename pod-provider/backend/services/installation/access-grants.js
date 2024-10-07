const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');

module.exports = {
  name: 'access-grants',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:AccessGrant'],
    newResourcesPermissions: {
      anon: {
        read: true
      }
    },
    excludeFromMirror: true,
    activateTombstones: false,
    description: {
      labelMap: {
        en: 'Access Grants'
      },
      internal: true
    }
  },
  actions: {
    put() {
      throw new Error(`The resources of type interop:AccessGrant are immutable`);
    },
    patch() {
      throw new Error(`The resources of type interop:AccessGrant are immutable`);
    },
    // Get all the AccessGrants granted to an application
    async getForApp(ctx) {
      const { appUri, podOwner } = ctx.params;

      const containerUri = await this.actions.getContainerUri({ webId: podOwner }, { parentCtx: ctx });

      const filteredContainer = await this.actions.list(
        {
          containerUri,
          filters: {
            'http://www.w3.org/ns/solid/interop#grantedBy': podOwner,
            'http://www.w3.org/ns/solid/interop#grantee': appUri
          },
          webId: 'system'
        },
        { parentCtx: ctx }
      );

      return arrayOf(filteredContainer['ldp:contains']);
    },
    // Get all the special rights granted to an application
    async getSpecialRights(ctx) {
      const { appUri, podOwner } = ctx.params;

      const accessGrants = await this.actions.getForApp({ appUri, podOwner }, { parentCtx: ctx });

      return accessGrants.reduce((acc, cur) => {
        if (cur['apods:hasSpecialRights']) acc.push(...arrayOf(cur['apods:hasSpecialRights']));
        return acc;
      }, []);
    },
    // Get the AccessGrant linked with an AcccessNeedGroup
    async getByAccessNeedGroup(ctx) {
      const { accessNeedGroupUri, podOwner } = ctx.params;

      const filteredContainer = await this.actions.list(
        {
          filters: {
            'http://www.w3.org/ns/solid/interop#grantedBy': podOwner,
            'http://www.w3.org/ns/solid/interop#hasAccessNeedGroup': accessNeedGroupUri
          },
          webId: podOwner
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0];
    },
    // Delete AccessGrants which are not linked to an AccessNeedGroup (may happen on app upgrade)
    async deleteOrphans(ctx) {
      const { appUri, podOwner } = ctx.params;
      const accessGrants = await this.actions.getForApp({ appUri, podOwner }, { parentCtx: ctx });
      for (const accessGrant of accessGrants) {
        try {
          await ctx.call('ldp.remote.get', { resourceUri: accessGrant['interop:hasAccessNeedGroup'] });
        } catch (e) {
          if (e.code === 404) {
            this.logger.info(
              `Deleting ${accessGrant.id} as it is not linked anymore with an existing access need group...`
            );
            await this.actions.delete({ resourceUri: accessGrant.id, webId: podOwner });
          } else {
            throw e;
          }
        }
      }
    }
  },
  hooks: {
    after: {
      async post(ctx, res) {
        const webId = ctx.params.resource['interop:grantedBy'];
        const appUri = ctx.params.resource['interop:grantee'];
        const specialRightsUris = arrayOf(ctx.params.resource['apods:hasSpecialRights']);

        // Give read permissions on all activities, if requested
        if (specialRightsUris.includes('apods:ReadInbox') || specialRightsUris.includes('apods:ReadOutbox')) {
          await ctx.call('webacl.resource.addRights', {
            resourceUri: await ctx.call('activitypub.activity.getContainerUri', { webId }),
            additionalRights: {
              default: {
                user: {
                  uri: appUri,
                  read: true
                }
              }
            },
            webId: 'system'
          });
        }

        // Give update permission on user's webId, if requested
        if (specialRightsUris.includes('apods:UpdateWebId')) {
          await ctx.call('webacl.resource.addRights', {
            resourceUri: webId,
            additionalRights: {
              user: {
                uri: appUri,
                write: true
              }
            },
            webId: 'system'
          });
        }

        // Give read/write permissions on all existing collections
        // plus permission to create collection, if it was requested
        await ctx.call('webacl.resource.addRights', {
          resourceUri: await ctx.call('activitypub.collection.getContainerUri', { webId }),
          additionalRights: {
            default: {
              user: {
                uri: appUri,
                read: true,
                write: true
              }
            },
            user: specialRightsUris.includes('apods:CreateCollection')
              ? {
                  uri: appUri,
                  write: true
                }
              : undefined
          },
          webId: 'system'
        });

        // Give read/write permissions on the files container
        await ctx.call('webacl.resource.addRights', {
          resourceUri: await ctx.call('files.getContainerUri', { webId }),
          additionalRights: {
            user: {
              uri: appUri,
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

        return res;
      },
      // Mirror of the post hook
      async delete(ctx, res) {
        const webId = res.oldData['interop:grantedBy'];
        const appUri = res.oldData['interop:grantee'];
        const specialRightsUris = arrayOf(res.oldData['apods:hasSpecialRights']);

        // Remove read permissions on all activities, if requested
        if (specialRightsUris.includes('apods:ReadInbox') || specialRightsUris.includes('apods:ReadOutbox')) {
          await ctx.call('webacl.resource.removeRights', {
            resourceUri: await ctx.call('activitypub.activity.getContainerUri', { webId }),
            rights: {
              default: {
                user: {
                  uri: appUri,
                  read: true
                }
              }
            },
            webId: 'system'
          });
        }

        // Remove update permission on user's webId, if requested
        if (specialRightsUris.includes('apods:UpdateWebId')) {
          await ctx.call('webacl.resource.removeRights', {
            resourceUri: webId,
            rights: {
              user: {
                uri: appUri,
                write: true
              }
            },
            webId: 'system'
          });
        }

        // Remove read/write permissions on all existing collections
        // plus permission to create collection, if it was requested
        await ctx.call('webacl.resource.removeRights', {
          resourceUri: await ctx.call('activitypub.collection.getContainerUri', { webId }),
          rights: {
            default: {
              user: {
                uri: appUri,
                read: true,
                write: true
              }
            },
            user: specialRightsUris.includes('apods:CreateCollection')
              ? {
                  uri: appUri,
                  write: true
                }
              : undefined
          },
          webId: 'system'
        });

        // Remove read/write permissions on the files container
        await ctx.call('webacl.resource.removeRights', {
          resourceUri: await ctx.call('files.getContainerUri', { webId }),
          rights: {
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

        return res;
      }
    }
  }
};
