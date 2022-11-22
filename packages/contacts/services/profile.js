const { triple, namedNode } = require('@rdfjs/data-model');
const { ControlledContainerMixin } = require('@semapps/ldp');
const { OBJECT_TYPES, ActivitiesHandlerMixin, AS_PREFIX } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const { SynchronizerMixin } = require('@activitypods/synchronizer');
const { REMOVE_CONTACT } = require("../config/patterns");

module.exports = {
  name: 'contacts.profile',
  mixins: [SynchronizerMixin, ControlledContainerMixin, ActivitiesHandlerMixin],
  settings: {
    path: '/profiles',
    acceptedTypes: ['vcard:Individual', OBJECT_TYPES.PROFILE],
    permissions: {},
    newResourcesPermissions: {},
  },
  dependencies: ['activitypub', 'webacl'],
  events: {
    async 'auth.registered'(ctx) {
      const { webId, profileData } = ctx.params;
      const containerUri = await this.actions.getContainerUri({ webId }, { parentCtx: ctx });

      await this.waitForContainerCreation(containerUri);

      const profileUri = await this.actions.post({
        containerUri,
        resource: {
          '@type': ['vcard:Individual', OBJECT_TYPES.PROFILE],
          'vcard:fn': profileData.familyName
            ? `${profileData.name} ${profileData.familyName.toUpperCase()}`
            : profileData.name,
          'vcard:given-name': profileData.name,
          'vcard:family-name': profileData.familyName,
          describes: webId,
        },
        contentType: MIME_TYPES.JSON,
        webId,
      });

      await ctx.call('ldp.resource.patch', {
        resourceUri: webId,
        triplesToAdd: [
          triple(namedNode(webId), namedNode(AS_PREFIX+'url'), namedNode(profileUri))
        ],
        webId,
      });

      // Create a WebACL group for the user's contact
      const { groupUri: contactsGroupUri } = await ctx.call('webacl.group.create', {
        groupSlug: new URL(webId).pathname + '/contacts',
        webId,
      });

      // Authorize this group to view the user's profile
      await ctx.call('webacl.resource.addRights', {
        resourceUri: profileUri,
        additionalRights: {
          group: {
            uri: contactsGroupUri,
            read: true,
          },
        },
        webId,
      });
    },
  },
  activities: {
    removeContact: {
      match: REMOVE_CONTACT,
      async onEmit(ctx, activity, emitterUri) {
        if (!activity.origin)
          throw new Error('The origin property is missing from the Remove activity');

        if (!activity.origin.startsWith(emitterUri))
          throw new Error(`Cannot remove from collection ${activity.origin} as it is not owned by the emitter`);

        await ctx.call('activitypub.collection.detach', {
          collectionUri: activity.origin,
          item: activity.object.id,
        });

        const actor = await ctx.call('activitypub.actor.get', { actorUri: activity.object.id, webId: activity.object.id });

        await ctx.call('activitypub.object.deleteFromCache', {
          actorUri: emitterUri,
          objectUri: actor.url,
        });
      }
    },
  }
};
