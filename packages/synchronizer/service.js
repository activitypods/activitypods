const { ACTIVITY_TYPES, ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { defaultToArray } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'synchronizer',
  mixins: [ActivitiesHandlerMixin],
  settings: {
    watchedTypes: [],
  },
  actions: {
    watch(ctx) {
      const { types } = ctx.params;
      this.settings.watchedTypes.push(...types);
    },
    async announceUpdate(ctx) {
      const { objectUri, newData } = ctx.params;

      const creator = await ctx.call('activitypub.actor.get', { actorUri: newData['dc:creator'] });
      const usersWithReadAuthorization = await this.getUsersWithReadAuthorization(ctx, objectUri, creator.id);

      if (usersWithReadAuthorization.length > 0) {
        await ctx.call('activitypub.outbox.post', {
          collectionUri: creator.outbox,
          type: ACTIVITY_TYPES.ANNOUNCE,
          actor: creator.id,
          object: {
            type: ACTIVITY_TYPES.UPDATE,
            object: objectUri,
          },
          to: usersWithReadAuthorization,
        });
      }
    },
    async announceDelete(ctx) {
      const { objectUri, oldData } = ctx.params;

      const creator = await ctx.call('activitypub.actor.get', { actorUri: oldData['dc:creator'] });
      const usersWithReadAuthorization = await this.getUsersWithReadAuthorization(ctx, objectUri, creator.id);

      if (usersWithReadAuthorization.length > 0) {
        await ctx.call('activitypub.outbox.post', {
          collectionUri: creator.outbox,
          type: ACTIVITY_TYPES.ANNOUNCE,
          actor: creator.id,
          object: {
            type: ACTIVITY_TYPES.DELETE,
            object: objectUri,
          },
          to: usersWithReadAuthorization,
        });
      }
    }
  },
  methods: {
    // When https://github.com/assemblee-virtuelle/semapps/issues/907 will be fixed,
    // we will be able to use the 'system' webId (we will thus avoid a few errors)
    async getUsersWithReadAuthorization(ctx, resourceUri, webId) {
      const authorizations = await ctx.call('webacl.resource.getRights', {
        resourceUri,
        accept: MIME_TYPES.JSON,
        webId,
      });
      const readAuthorization =
        authorizations['@graph'] && authorizations['@graph'].find((auth) => auth['@id'] === '#Read');

      let usersWithReadAuthorization = [];
      if (readAuthorization) {
        usersWithReadAuthorization = defaultToArray(readAuthorization['acl:agent']) || [];
        const groupsWithReadAuthorization = defaultToArray(readAuthorization['acl:agentGroup']) || [];

        for (let groupUri of groupsWithReadAuthorization) {
          const members = await ctx.call('webacl.group.getMembers', { groupUri, webId });
          if (members) usersWithReadAuthorization.push(...members);
        }
      }

      return usersWithReadAuthorization;
    }
  },
  activities: {
    announceUpdate: {
      async match(activity) {
        if (this.settings.watchedTypes.length === 0) return false;
        const pattern = {
          type: ACTIVITY_TYPES.ANNOUNCE,
          object: {
            type: ACTIVITY_TYPES.UPDATE,
            object: {
              type: this.settings.watchedTypes,
            },
          },
        };
        return await this.matchPattern(pattern, activity);
      },
      async onReceive(ctx, activity, recipients) {
        for (let recipientUri of recipients) {
          await ctx.call('activitypub.object.cacheRemote', {
            objectUri: activity.object.object.id,
            actorUri: recipientUri,
          });
        }
      },
    },
    announceDelete: {
      async match(activity) {
        if (this.settings.watchedTypes.length === 0) return false;
        const pattern = {
          type: ACTIVITY_TYPES.ANNOUNCE,
          object: {
            type: ACTIVITY_TYPES.DELETE,
            object: {
              'as:formerType': this.settings.watchedTypes,
            },
          },
        };
        return await this.matchPattern(pattern, activity);
      },
      async onReceive(ctx, activity, recipients) {
        for (let recipientUri of recipients) {
          await ctx.call('activitypub.object.deleteFromCache', {
            objectUri: activity.object.object.id,
            actorUri: recipientUri,
          });
        }
      },
    },
  },
};
