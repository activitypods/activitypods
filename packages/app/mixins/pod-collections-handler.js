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
    },
    createWacGroup: false
  },
  dependencies: ['pod-collections'],
  actions: {
    async createAndAttach(ctx) {
      const { resourceUri, actorUri } = ctx.params;
      const { attachPredicate, collectionOptions } = this.settings;
      await ctx.call('pod-collections.createAndAttach', {
        resourceUri,
        attachPredicate,
        collectionOptions,
        actorUri
      });
    },
    async deleteAndDetach(ctx) {
      const { resourceUri, actorUri } = ctx.params;
      const { attachPredicate } = this.settings;
      await ctx.call('pod-collections.deleteAndDetach', {
        resourceUri,
        attachPredicate,
        actorUri
      });
    },
    async createAndAttachMissing(ctx) {
      const { type, attachPredicate, collectionOptions } = this.settings;
      await ctx.call('pod-collections.createAndAttachMissing', {
        type,
        attachPredicate,
        collectionOptions
      });
    }
  },
  methods: {
    async onCreate(ctx, resource, actorUri) {
      await this.actions.createAndAttach(
        {
          resourceUri: resource.id || resource['@id'],
          actorUri
        },
        { parentCtx: ctx }
      );
    },
    async onDelete(ctx, resourceUri, actorUri) {
      await this.actions.deleteAndDetach(
        {
          resourceUri,
          actorUri
        },
        { parentCtx: ctx }
      );
    }
  }
};
