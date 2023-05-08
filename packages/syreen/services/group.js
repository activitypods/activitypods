const { ActivitiesHandlerMixin, ACTIVITY_TYPES } = require('@semapps/activitypub');

module.exports = {
  name: 'syreen.group',
  mixins: [ActivitiesHandlerMixin],
  settings: {
    groupUri: null
  },
  activities: {
    acceptJoinGroup: {
      match(ctx, activity) {
        return this.matchActivity(
          ctx,
          {
            type: ACTIVITY_TYPES.ACCEPT,
            actor: this.settings.groupUri,
            object: {
              type: ACTIVITY_TYPES.JOIN,
              object: this.settings.groupUri
            }
          },
          activity
        );
      },
      async onReceive(ctx, activity, recipientUri) {
        const groupExist = await ctx.call('webacl.group.exist', {
          groupSlug: new URL(recipientUri).pathname + '/syreen',
          webId: 'system', // We cannot use recipientUri or we get a 403
        });

        if (!groupExist) {
          // Create a local ACL group for Syreen members
          const { groupUri } = await ctx.call('webacl.group.create', {
            groupSlug: new URL(recipientUri).pathname + '/syreen',
            webId: recipientUri,
          });

          const recipient = await ctx.call('activitypub.actor.get', {
            actorUri: recipientUri,
            webId: recipientUri
          });

          const emitter = await ctx.call('activitypub.actor.get', {
            actorUri: activity.actor,
            webId: recipientUri
          });

          const groupFollowersCollection = await ctx.call('ldp.remote.get', {
            resourceUri: emitter.followers,
            webId: recipientUri
          });

          if (groupFollowersCollection) {
            // Add current group members to ACL group
            for (let memberUri of groupFollowersCollection.items) {
              await ctx.call('webacl.group.addMember', {
                groupUri,
                memberUri,
                webId: recipientUri
              });
            }

            // TODO Also add syreen group ??
          }

          // Authorize this ACL group to view the recipient's profile
          await ctx.call('webacl.resource.addRights', {
            resourceUri: recipient.url,
            additionalRights: {
              group: {
                uri: groupUri,
                read: true,
              },
            },
            webId: recipientUri,
          });
        }
      }
    },
    announceJoinGroup: {
      match(ctx, activity) {
        return this.matchActivity(
          ctx,
          {
            type: ACTIVITY_TYPES.ANNOUNCE,
            actor: this.settings.groupUri,
            object: {
              type: ACTIVITY_TYPES.JOIN,
              object: this.settings.groupUri
            }
          },
          activity
        );
      },
      async onReceive(ctx, activity, recipientUri) {
        await ctx.call('webacl.group.addMember', {
          groupSlug: new URL(recipientUri).pathname + '/syreen',
          memberUri: activity.object.actor,
          webId: recipientUri
        });
      }
    },
    announceLeaveGroup: {
      match(ctx, activity) {
        return this.matchActivity(
          ctx,
          {
            type: ACTIVITY_TYPES.ANNOUNCE,
            actor: this.settings.groupUri,
            object: {
              type: ACTIVITY_TYPES.LEAVE,
              object: this.settings.groupUri
            }
          },
          activity
        );
      },
      async onReceive(ctx, activity, recipientUri) {
        await ctx.call('webacl.group.removeMember', {
          groupSlug: new URL(recipientUri).pathname + '/syreen',
          memberUri: activity.object.actor,
          webId: recipientUri
        });
      }
    }
  }
};
