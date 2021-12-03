const { ControlledContainerMixin, hasType } = require('@semapps/ldp');
const { OBJECT_TYPES, ACTIVITY_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require("@semapps/mime-types");

module.exports = {
  name: 'contacts.profile',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/profiles',
    acceptedTypes: ['pair:Person', OBJECT_TYPES.PROFILE],
    permissions: {},
    newResourcesPermissions: {}
  },
  dependencies: ['activitypub', 'webacl'],
  actions: {
    async announceUpdate(ctx) {
      const { profileUri } = ctx.params;
      const updatedProfile = await ctx.call('activitypub.proxy.query', { objectUri: profileUri });
      const actor = await ctx.call('activitypub.actor.get', { actorUri: updatedProfile.describes });

      // Get all actors IDs, except for the actor himself
      const containerUri = await this.getContainerUri(actor.id);
      const container = await this.actions.list({ containerUri }, { parentCtx: ctx });
      const recipients = container['ldp:contains']
        .map(profile => profile.describes)
        .filter(id => id !== actor.id);

      if( recipients.length > 0 ) {
        await ctx.call('activitypub.outbox.post', {
          collectionUri: actor.outbox,
          type: ACTIVITY_TYPES.ANNOUNCE,
          actor: actor.id,
          object: {
            type: ACTIVITY_TYPES.UPDATE,
            object: profileUri
          },
          to: recipients
        });
      }
    }
  },
  events: {
    async 'auth.registered'(ctx) {
      const { webId, profileData } = ctx.params;
      const containerUri = await this.getContainerUri(webId);

      await this.waitForContainerCreation(containerUri);

      const profileUrl = await this.actions.post({
        resource: {
          '@type': ['pair:Person', OBJECT_TYPES.PROFILE],
          'pair:label': profileData.familyName ? `${profileData.name} ${profileData.familyName.toUpperCase()}` : profileData.name,
          'pair:firstName': profileData.name,
          'pair:lastName': profileData.familyName,
          describes: webId,
        },
        containerUri,
        contentType: MIME_TYPES.JSON,
        webId
      });

      await ctx.call('ldp.resource.patch', {
        resource: {
          '@id': webId,
          url: profileUrl
        },
        contentType: MIME_TYPES.JSON,
        webId
      });
    },
    async 'activitypub.inbox.received'(ctx) {
      const { activity, recipients } = ctx.params;
      if( await this.isProfileUpdate(ctx, activity) ) {
        for( let recipientUri of recipients ) {
          await ctx.call('activitypub.object.cacheRemote', {
            objectUri: activity.object.object,
            actorUri: recipientUri
          });
        }
      }
    }
  },
  methods:  {
    async isProfileUpdate(ctx, activity) {
      if( activity.type === ACTIVITY_TYPES.ANNOUNCE && activity.object.type === ACTIVITY_TYPES.UPDATE ) {
        const object = await ctx.call('activitypub.object.get', { objectUri: activity.object.object, actorUri: activity.actor });
        return hasType(object, OBJECT_TYPES.PROFILE);
      }
      return false;
    }
  },
  hooks: {
    after: {
      put(ctx, res) {
        this.actions.announceUpdate({ profileUri: res }, { parentCtx: ctx });
      },
      patch(ctx, res) {
        this.actions.announceUpdate({ profileUri: res }, { parentCtx: ctx });
      }
    }
  }
};
