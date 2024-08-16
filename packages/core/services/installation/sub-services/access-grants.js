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
    activateTombstones: false
  },
  actions: {
    async getSpecialRights(ctx) {
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

      return arrayOf(filteredContainer['ldp:contains']).reduce((acc, cur) => {
        if (cur['apods:hasSpecialRights']) acc.push(...arrayOf(cur['apods:hasSpecialRights']));
        return acc;
      }, []);
    }
  },
  hooks: {
    after: {
      async post(ctx, res) {
        const specialRightsUris = arrayOf(ctx.params.resource['apods:hasSpecialRights']);

        if (specialRightsUris.includes('apods:ReadInbox') || specialRightsUris.includes('apods:ReadOutbox')) {
          const activitiesContainerUri = await ctx.call('activitypub.activity.getContainerUri', {
            webId: ctx.params.resource['interop:grantedBy']
          });

          // Give read permissions on all activities
          await ctx.call('webacl.resource.addRights', {
            resourceUri: activitiesContainerUri,
            additionalRights: {
              default: {
                user: {
                  uri: ctx.params.resource['interop:grantee'],
                  read: true
                }
              }
            },
            webId: 'system'
          });
        }

        if (specialRightsUris.includes('apods:UpdateWebId')) {
          await ctx.call('webacl.resource.addRights', {
            resourceUri: ctx.params.resource['interop:grantedBy'],
            additionalRights: {
              user: {
                uri: ctx.params.resource['interop:grantee'],
                write: true
              }
            },
            webId: 'system'
          });
        }

        const collectionsContainerUri = await ctx.call('activitypub.collection.getContainerUri', {
          webId: ctx.params.resource['interop:grantedBy']
        });

        // Give read/write permissions on all existing collections
        await ctx.call('webacl.resource.addRights', {
          resourceUri: collectionsContainerUri,
          additionalRights: {
            default: {
              user: {
                uri: ctx.params.resource['interop:grantee'],
                read: true,
                write: true
              }
            }
          },
          webId: 'system'
        });

        if (specialRightsUris.includes('apods:CreateCollection')) {
          // Give permission to create new collections
          await ctx.call('webacl.resource.addRights', {
            resourceUri: collectionsContainerUri,
            additionalRights: {
              user: {
                uri: ctx.params.resource['interop:grantee'],
                write: true
              }
            },
            webId: 'system'
          });
        }

        // Give read/write permissions on the files container

        const filesContainerUri = await ctx.call('files.getContainerUri', {
          webId: ctx.params.resource['interop:grantedBy']
        });

        await ctx.call('webacl.resource.addRights', {
          resourceUri: filesContainerUri,
          additionalRights: {
            default: {
              user: {
                uri: ctx.params.resource['interop:grantee'],
                read: true,
                write: true
              }
            }
          },
          webId: 'system'
        });

        return res;
      },
      async delete(ctx, res) {
        // Remove all rights of the application on the Pod
        await ctx.call('webacl.resource.deleteAllUserRights', {
          webId: res.oldData['interop:grantee']
        });

        return res;
      }
    }
  }
};
