const { getAnnouncedGroupUri } = require('@activitypods/announcer');

module.exports = {
  name: 'events.location',
  action: {
    async setNewRights(ctx) {
      const { resourceUri, newData } = ctx.params;

      // Give read right for the event's location
      await ctx.call('webacl.resource.addRights', {
        resourceUri: newData.location,
        additionalRights: {
          group: {
            uri: getAnnouncedGroupUri(resourceUri),
            read: true,
          },
        },
        webId: newData['dc:creator'],
      });
    },
    async updateRights(ctx) {
      const { resourceUri, newData, oldData } = ctx.params;

      // If event location has changed, remove rights on old location and add them to new one
      if (newData.location !== oldData.location) {
        await ctx.call('webacl.resource.addRights', {
          resourceUri: newData.location,
          additionalRights: {
            group: {
              uri: getAnnouncedGroupUri(resourceUri),
              read: true,
            },
          },
          webId: newData['dc:creator'],
        });

        await ctx.call('webacl.resource.removeRights', {
          resourceUri: oldData.location,
          rights: {
            group: {
              uri: getAnnouncedGroupUri(resourceUri),
              read: true,
            },
          },
        });
      }
    }
  }
};
