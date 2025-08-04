import { getId, arrayOf } from '@semapps/ldp';

// Service that maps access grants and special rights to WAC permissions
// For mapping details, see https://github.com/assemblee-virtuelle/activitypods/issues/116
const PermissionsMapperSchema = {
  name: 'permissions-mapper',
  actions: {
    async addPermissionsFromGrant(ctx) {
      const { grant } = ctx.params;

      const grantee = grant['interop:grantee'];
      const accessMode = arrayOf(grant['interop:accessMode']);
      const scope = grant['interop:scopeOfGrant'];

      if (scope === 'interop:AllFromRegistry') {
        // Give read-write permission to the whole container
        await ctx.call('webacl.resource.addRights', {
          resourceUri: grant['interop:hasDataRegistration'],
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
        for (const resourceUri of arrayOf(grant['interop:hasDataInstance'])) {
          // Give read-write permission to the resources
          await ctx.call('webacl.resource.addRights', {
            resourceUri,
            additionalRights: {
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
      } else {
        throw new Error(`Unknown scope ${scope} for access grant ${getId(grant)}`);
      }
    },
    async removePermissionsFromGrant(ctx) {
      const { grant } = ctx.params;
      const grantee = grant['interop:grantee'];
      const accessMode = arrayOf(grant['interop:accessMode']);
      const scope = grant['interop:scopeOfGrant'];

      if (scope === 'interop:AllFromRegistry') {
        await ctx.call('webacl.resource.removeRights', {
          resourceUri: grant['interop:hasDataRegistration'],
          rights: {
            user: {
              uri: grantee,
              read: accessMode.includes('acl:Read'),
              write: accessMode.includes('acl:Write')
            },
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
        for (const resourceUri of arrayOf(grant['interop:hasDataInstance'])) {
          await ctx.call('webacl.resource.removeRights', {
            resourceUri,
            rights: {
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
      } else {
        throw new Error(`Unknown scope ${scope} for access grant ${getId(grant)}`);
      }
    },
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

export default PermissionsMapperSchema;
