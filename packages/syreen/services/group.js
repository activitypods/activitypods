const { ActivitiesHandlerMixin, ACTIVITY_TYPES } = require('@semapps/activitypub');
const { getSyreenAclGroupUri } = require('../utils')

module.exports = {
  name: 'syreen.group',
  mixins: [ActivitiesHandlerMixin],
  settings: {
    groupUri: null
  },
  async started() {
    // Don't send notifications when the offer comes from Syreen group
    await this.broker.call('activity-mapping.addMapper', {
      match: {
        type: ACTIVITY_TYPES.ANNOUNCE,
        actor: this.settings.groupUri,
      },
      mapping: false,
      priority: 2
    });
  },
  activities: {
    joinGroup: {
      match(ctx, activity) {
        return this.matchActivity(
          ctx,
          {
            type: ACTIVITY_TYPES.JOIN,
            object: this.settings.groupUri
          },
          activity
        );
      },
      async onEmit(ctx, activity, emitterUri) {
        const aclGroupUri = getSyreenAclGroupUri(emitterUri);

        const groupExist = await ctx.call('webacl.group.exist', {
          groupUri: aclGroupUri,
          webId: 'system', // We cannot use recipientUri or we get a 403
        });

        if (!groupExist) {
          // Create a local ACL group for Syreen members
          await ctx.call('webacl.group.create', {
            groupUri: aclGroupUri,
            webId: emitterUri,
          });

          const emitter = await ctx.call('activitypub.actor.get', {
            actorUri: emitterUri,
            webId: emitterUri
          });

          await ctx.call('webacl.group.addMember', {
            groupUri: aclGroupUri,
            memberUri: this.settings.groupUri,
            webId: emitterUri
          });

          const group = await ctx.call('activitypub.actor.get', {
            actorUri: this.settings.groupUri
          });

          const groupFollowersCollection = await ctx.call('ldp.remote.get', {
            resourceUri: group.followers
          });

          if (groupFollowersCollection) {
            // Add current group members to ACL group
            for (let memberUri of groupFollowersCollection.items) {
              await ctx.call('webacl.group.addMember', {
                groupUri: aclGroupUri,
                memberUri,
                webId: emitterUri
              });
            }
          }

          // Authorize this ACL group to view the recipient's profile
          await ctx.call(
            'webacl.resource.addRights',
            {
              resourceUri: emitter.url,
              additionalRights: {
                group: {
                  uri: aclGroupUri,
                  read: true,
                },
              },
              webId: emitterUri,
            },
            {
              meta: {
                // We don't want the user to announce directly to other group members
                skipObjectsWatcher: true
              }
            }
          );
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
          groupUri: getSyreenAclGroupUri(recipientUri),
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
          groupUri: getSyreenAclGroupUri(recipientUri),
          memberUri: activity.object.actor,
          webId: recipientUri
        });
      }
    },
    announceToGroup: {
      match(ctx, activity) {
        return this.matchActivity(
          ctx,
          {
            type: ACTIVITY_TYPES.ANNOUNCE,
            to: this.settings.groupUri,
            object: {
              type: 'syreen:Offer'
            }
          },
          activity
        );
      },
      async onEmit(ctx, activity, emitterUri) {
        const project = await ctx.call('syreen.project.get', {
          resourceUri: activity.object['syreen:partOf'],
          webId: emitterUri
        });

        const resourcesUris = [
          activity.object.id, // Offer
          activity.object['syreen:hasLocation'], // Offer location
          project.id, // Project
          project['syreen:hasLocation'] // Project location
        ];

        for (let resourceUri of resourcesUris) {
          if (resourceUri) {
            await ctx.call(
              'webacl.resource.addRights',
              {
                resourceUri,
                additionalRights: {
                  group: {
                    uri: getSyreenAclGroupUri(emitterUri),
                    read: true,
                  },
                },
                webId: emitterUri
              },
              {
                meta: {
                  // We don't want the user to announce directly to other group members
                  skipObjectsWatcher: true
                }
              }
            );
          }
        }
      }
    }
  }
};
