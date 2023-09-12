const { getAnnouncesGroupUri } = require('@activitypods/announcer');

module.exports = {
  name: 'syreen.location',
  actions: {
    async setNewRights(ctx) {
      const { resourceUri, newData } = ctx.params;

      // Give read right for the event's location (if it is set)
      if (newData['syreen:hasLocation']) {
        await ctx.call('webacl.resource.addRights', {
          resourceUri: newData['syreen:hasLocation'],
          additionalRights: {
            group: {
              uri: getAnnouncesGroupUri(resourceUri),
              read: true,
            },
          },
          webId: newData['dc:creator'],
        });
      }
    },
    async updateRights(ctx) {
      const { resourceUri, newData, oldData } = ctx.params;

      // If event location has changed, remove rights on old location and add them to new one
      if (newData['syreen:hasLocation'] !== oldData['syreen:hasLocation']) {
        if (newData['syreen:hasLocation']) {
          await ctx.call('webacl.resource.addRights', {
            resourceUri: newData['syreen:hasLocation'],
            additionalRights: {
              group: {
                uri: getAnnouncesGroupUri(resourceUri),
                read: true,
              },
            },
            webId: newData['dc:creator'],
          });
        }

        if (oldData['syreen:hasLocation']) {
          await ctx.call('webacl.resource.removeRights', {
            resourceUri: oldData['syreen:hasLocation'],
            rights: {
              group: {
                uri: getAnnouncesGroupUri(resourceUri),
                read: true,
              },
            },
            webId: newData['dc:creator'],
          });
        }
      }
    },
  },
};
