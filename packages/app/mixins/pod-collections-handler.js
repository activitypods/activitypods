const PodResourcesHandlerMixin = require('./pod-resources-handler');

module.exports = {
  mixins: [PodResourcesHandlerMixin],
  settings: {
    type: null,
    attachPredicate: null,
    collectionOptions: {
      ordered: false,
      summary: undefined,
      itemsPerPage: undefined, // No pagination per default
      dereferenceItems: false,
      sortPredicate: 'as:published',
      sortOrder: 'DESC'
    }
  },
  methods: {
    async onCreate(ctx, resource, actorUri) {
      const { attachPredicate, collectionOptions } = this.settings;
      await ctx.call('pod-collections.createAndAttach', {
        objectUri: resource.id || resource['@id'],
        attachPredicate,
        collectionOptions,
        actorUri
      });
    },
    async onDelete(ctx, resourceUri, actorUri) {
      const { attachPredicate } = this.settings;
      await ctx.call('pod-collections.deleteAndDetach', {
        objectUri: resourceUri,
        attachPredicate,
        actorUri
      });
    }
  }
};
