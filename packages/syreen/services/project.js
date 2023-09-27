const { ControlledContainerMixin } = require('@semapps/ldp');
const { AnnouncerMixin, getAnnouncesGroupUri } = require('@activitypods/announcer');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'syreen.project',
  mixins: [AnnouncerMixin, ControlledContainerMixin],
  settings: {
    path: '/syreen/projects',
    acceptedTypes: ['syreen:Project'],
    permissions: {},
    newResourcesPermissions: {},
  },
  hooks: {
    after: {
      async create(ctx, res) {
        // Do not await to increase performances
        ctx.call('syreen.location.setNewRights', res);
        return res;
      },
      async put(ctx, res) {
        // Do not await to increase performances
        ctx.call('syreen.location.updateRights', res);
        return res;
      },
    },
  },
  actions: {
    async setNewRights(ctx) {
      const { resourceUri: offerUri, newData } = ctx.params;
      const projectUri = newData['syreen:partOf'];

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
    async getProjectOffers(ctx) {
      const { projectUri } = ctx.params;

      const result = await ctx.call('triplestore.query', {
        query: `
          SELECT ?offerUri 
          WHERE {
            ?offerUri <http://syreen.fr/ns/core#partOf> <${projectUri}>
          }
        `,
        accept: MIME_TYPES.JSON,
        webId: 'system',
      });

      return result.map((node) => node.offerUri.value);
    },
  },
};
