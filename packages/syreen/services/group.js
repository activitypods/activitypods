const { ActivitiesHandlerMixin, ACTIVITY_TYPES } = require('@semapps/activitypub');
const { getSyreenGroupUri } = require('../utils')

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
        const groupUri = getSyreenGroupUri(recipientUri);

        const groupExist = await ctx.call('webacl.group.exist', {
          groupUri,
          webId: 'system', // We cannot use recipientUri or we get a 403
        });

        if (!groupExist) {
          // Create a local ACL group for Syreen members
          await ctx.call('webacl.group.create', {
            groupUri,
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
          await ctx.call(
            'webacl.resource.addRights',
            {
              resourceUri: recipient.url,
              additionalRights: {
                group: {
                  uri: groupUri,
                  read: true,
                },
              },
              webId: recipientUri,
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
          groupUri: getSyreenGroupUri(recipientUri),
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
          groupUri: getSyreenGroupUri(recipientUri),
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
        await ctx.call(
          'webacl.resource.addRights',
          {
            resourceUri: activity.object.id,
            additionalRights: {
              group: {
                uri: getSyreenGroupUri(emitterUri),
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

        // Also give read rights on the project
        await ctx.call(
          'webacl.resource.addRights',
          {
            resourceUri: activity.object['syreen:partOf'],
            additionalRights: {
              group: {
                uri: getSyreenGroupUri(emitterUri),
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
};
