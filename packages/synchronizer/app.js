const { ACTIVITY_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const { hasType } = require('@semapps/ldp');

module.exports = {
  name: 'synchronizer',
  settings: {
    watchedTypes: [],
  },
  actions: {
    watchType(ctx) {
      const { type } = ctx.params;
      this.settings.watchedTypes.push(type);
    },
    async announceUpdate(ctx) {
      const { resourceUri, newData } = ctx.params;
      const creator = await ctx.call('activitypub.actor.get', { actorUri: newData['dc:creator'] });
      const permissions = await ctx.call('webacl.resource.getRights', { resourceUri, accept: MIME_TYPES.JSON, webId: 'system' });

      const usersWithReadPermissions = permissions.map('')
      const groupsWithReadPermissions = permissions.map('')
      // Extract users from groups and add them to usersWithReadPermissions array

      if( usersWithReadPermissions.length > 0 ) {
        await ctx.call('activitypub.outbox.post', {
          collectionUri: creator.outbox,
          type: ACTIVITY_TYPES.ANNOUNCE,
          actor: creator.id,
          object: {
            type: ACTIVITY_TYPES.UPDATE,
            object: resourceUri
          },
          to: usersWithReadPermissions
        });
      }
    }
  },
  events: {
    async 'ldp.resource.updated'(ctx) {
      const { resourceUri, newData } = ctx.params;
      for( let type of this.settings.watchedTypes ) {
        if( hasType(newData, type) ) {
          await this.actions.announceUpdate({ resourceUri }, { parentCtx: ctx });
        }
      }
    }
  },
  activities: {
    announceUpdateEvent: {
      async match(activity) {
        const pattern = {
          type: ACTIVITY_TYPES.ANNOUNCE,
          object: {
            type: ACTIVITY_TYPES.UPDATE,
            object: {
              type: this.watchedTypes
            }
          }
        };
        return await this.matchPattern(pattern, activity)
      },
      async onReceive(ctx, activity, recipients) {
        for( let recipientUri of recipients ) {
          await ctx.call('activitypub.object.cacheRemote', {
            objectUri: activity.object.object.id,
            actorUri: recipientUri
          });
        }
      }
    }
  }
};
