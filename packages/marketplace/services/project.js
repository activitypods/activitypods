const { ControlledContainerMixin } = require('@semapps/ldp');
const { AnnouncerMixin, getAnnouncesGroupUri } = require('@activitypods/announcer');

module.exports = {
  name: 'marketplace.project',
  mixins: [AnnouncerMixin, ControlledContainerMixin],
  settings: {
    path: '/projects',
    acceptedTypes: ['pair:Project'],
    dereference: [],
    permissions: {},
    newResourcesPermissions: {}
  },
  actions: {
    async setNewRights(ctx) {
      const { resourceUri: offerUri, newData } = ctx.params;
      const projectUri = newData['pair:partOf'];

      if (projectUri) {
        await ctx.call('webacl.resource.addRights', {
          resourceUri: projectUri,
          additionalRights: {
            group: {
              uri: getAnnouncesGroupUri(offerUri),
              read: true,
            },
          },
          webId: newData['dc:creator'],
        });
      }
    },
  }
};
