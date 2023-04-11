const { ControlledContainerMixin } = require('@semapps/ldp');
const { AnnouncerMixin, getAnnouncesGroupUri } = require('@activitypods/announcer');
const { MIME_TYPES } = require('@semapps/mime-types');

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
    async getProjectOffers(ctx) {
      const { projectUri } = ctx.params;

      const result = await ctx.call('triplestore.query', {
        query: `
          SELECT ?offerUri 
          WHERE {
            ?offerUri <http://virtual-assembly.org/ontologies/pair#partOf> <${projectUri}>
          }
        `,
        accept: MIME_TYPES.JSON,
        webId: 'system'
      });

      return result.map(node => node.offerUri.value);
    }
  }
};
