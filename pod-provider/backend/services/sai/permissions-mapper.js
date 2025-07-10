// Service that maps special rights to WAC permissions
module.exports = {
  name: 'permissions-mapper',
  actions: {
    async addPermissionsFromSpecialRights(ctx) {
      const { podOwner, appUri, specialRightsUris } = ctx.params;

      // Give read permissions on all activities, if requested
      if (specialRightsUris.includes('apods:ReadInbox') || specialRightsUris.includes('apods:ReadOutbox')) {
        await ctx.call('webacl.resource.addRights', {
          resourceUri: await ctx.call('activitypub.activity.getContainerUri', { webId: podOwner }),
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
          resourceUri: podOwner,
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
        resourceUri: await ctx.call('activitypub.collection.getContainerUri', { webId: podOwner }),
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
        resourceUri: await ctx.call('files.getContainerUri', { webId: podOwner }),
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
    },
    async removePermissionsFromSpecialRights(ctx) {
      const { podOwner, appUri, specialRightsUris } = ctx.params;

      // Remove read permissions on all activities, if requested
      if (specialRightsUris.includes('apods:ReadInbox') || specialRightsUris.includes('apods:ReadOutbox')) {
        await ctx.call('webacl.resource.removeRights', {
          resourceUri: await ctx.call('activitypub.activity.getContainerUri', { webId: podOwner }),
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
          resourceUri: podOwner,
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
        resourceUri: await ctx.call('activitypub.collection.getContainerUri', { webId: podOwner }),
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
        resourceUri: await ctx.call('files.getContainerUri', { webId: podOwner }),
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
    }
  }
};
