const { ControlledContainerMixin } = require('@semapps/ldp');
const { OBJECT_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'contacts.profile',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/profiles',
    acceptedTypes: ['vcard:Individual', OBJECT_TYPES.PROFILE],
    permissions: {},
    newResourcesPermissions: {},
  },
  dependencies: ['activitypub', 'webacl', 'synchronizer'],
  async started() {
    await this.broker.call('synchronizer.watch', { type: OBJECT_TYPES.PROFILE });
  },
  events: {
    async 'auth.registered'(ctx) {
      const { webId, profileData } = ctx.params;
      const containerUri = await this.getContainerUri(webId);

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
        resource: {
          '@id': webId,
          url: profileUri,
        },
        contentType: MIME_TYPES.JSON,
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
};
