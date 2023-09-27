const { getAnnouncesGroupUri } = require('@activitypods/announcer');

module.exports = {
  name: 'marketplace.location',
  actions: {
    async setNewRights(ctx) {
      const { resourceUri, newData } = ctx.params;
      const newLocation =
        newData['pair:hasLocation'] ||
        (newData['mp:hasGeoCondition'] && newData['mp:hasGeoCondition']['pair:hasLocation']);

      if (newLocation) {
        await ctx.call('webacl.resource.addRights', {
          resourceUri: newLocation,
          additionalRights: {
            group: {
              uri: getAnnouncesGroupUri(resourceUri),
              read: true
            }
          },
          webId: newData['dc:creator']
        });
      }
    },
    async updateRights(ctx) {
      const { resourceUri, newData, oldData } = ctx.params;
      const oldLocation =
        oldData['pair:hasLocation'] ||
        (oldData['mp:hasGeoCondition'] && oldData['mp:hasGeoCondition']['pair:hasLocation']);
      const newLocation =
        newData['pair:hasLocation'] ||
        (newData['mp:hasGeoCondition'] && newData['mp:hasGeoCondition']['pair:hasLocation']);

      if (newLocation !== oldLocation) {
        if (newLocation) {
          await ctx.call('webacl.resource.addRights', {
            resourceUri: newLocation,
            additionalRights: {
              group: {
                uri: getAnnouncesGroupUri(resourceUri),
                read: true
              }
            },
            webId: newData['dc:creator']
          });
        }

        if (oldLocation) {
          await ctx.call('webacl.resource.removeRights', {
            resourceUri: oldLocation,
            rights: {
              group: {
                uri: getAnnouncesGroupUri(resourceUri),
                read: true
              }
            }
          });
        }
      }
    }
  }
};
