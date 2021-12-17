const { ACTIVITY_TYPES, ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const { hasType, defaultToArray } = require('@semapps/ldp');

module.exports = {
  name: 'synchronizer',
  mixins: [ActivitiesHandlerMixin],
  settings: {
    watchedTypes: [],
  },
  actions: {
    watch(ctx) {
      const { type } = ctx.params;
      this.settings.watchedTypes.push(type);
    },
  },
  methods: {
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
    },
  },
  events: {
    async 'ldp.resource.updated'(ctx) {
      const { resourceUri, newData } = ctx.params;
      for (let type of this.settings.watchedTypes) {
        if (hasType(newData, type)) {
          const creator = await ctx.call('activitypub.actor.get', { actorUri: newData['dc:creator'] });
          const usersWithReadAuthorization = await this.getUsersWithReadAuthorization(ctx, resourceUri, creator.id);

          if (usersWithReadAuthorization.length > 0) {
            await ctx.call('activitypub.outbox.post', {
              collectionUri: creator.outbox,
              type: ACTIVITY_TYPES.ANNOUNCE,
              actor: creator.id,
              object: {
                type: ACTIVITY_TYPES.UPDATE,
                object: resourceUri,
              },
              to: usersWithReadAuthorization,
            });
          }
        }
      }
    },
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
  },
};
