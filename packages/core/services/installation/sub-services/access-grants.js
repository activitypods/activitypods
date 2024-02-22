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
    excludeFromMirror: true
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

        return res;
      },
      async delete(ctx, res) {
        const specialRightsUris = arrayOf(res.oldData['apods:hasSpecialRights']);

        if (specialRightsUris.includes('apods:ReadInbox') || specialRightsUris.includes('apods:ReadOutbox')) {
          const activitiesContainerUri = await ctx.call('activitypub.activity.getContainerUri', {
            webId: res.oldData['interop:grantedBy']
          });

          // Give read permissions on all activities
          await ctx.call('webacl.resource.removeRights', {
            resourceUri: activitiesContainerUri,
            rights: {
              default: {
                user: {
                  uri: res.oldData['interop:grantee'],
                  read: true
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
