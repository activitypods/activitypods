import PodResourcesHandlerMixin from './pod-resources-handler.ts';

const Schema = {
  mixins: [PodResourcesHandlerMixin],
  settings: {
    shapeTreeUri: null,
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
      const { attachPredicate, collectionOptions, createWacGroup } = this.settings;
      const collectionUri = await ctx.call('pod-collections.createAndAttach', {
        resourceUri,
        attachPredicate,
        collectionOptions,
        actorUri
      });
      if (createWacGroup) {
        await ctx.call('pod-wac-groups.create', {
          groupSlug: this.getGroupSlugFromCollectionUri(collectionUri),
          actorUri
        });
      }
      return collectionUri;
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
    async add(ctx) {
      const { collectionUri, itemUri, actorUri } = ctx.params;
      await ctx.call('pod-collections.add', { collectionUri, itemUri, actorUri });
      if (this.settings.createWacGroup) {
        await ctx.call('pod-wac-groups.addMember', {
          groupSlug: this.getGroupSlugFromCollectionUri(collectionUri),
          memberUri: itemUri,
          actorUri
        });
      }
    },
    async remove(ctx) {
      const { collectionUri, itemUri, actorUri } = ctx.params;
      await ctx.call('pod-collections.remove', { collectionUri, itemUri, actorUri });
      if (this.settings.createWacGroup) {
        await ctx.call('pod-wac-groups.removeMember', {
          groupSlug: this.getGroupSlugFromCollectionUri(collectionUri),
          memberUri: itemUri,
          actorUri
        });
      }
    },
    async createAndAttachMissing(ctx) {
      const { type, attachPredicate, collectionOptions } = this.settings;
      await ctx.call('pod-collections.createAndAttachMissing', {
        type,
        attachPredicate,
        collectionOptions
      });
    },
    async getCollectionUriFromResource(ctx) {
      const { resource } = ctx.params;
      const { attachPredicate } = this.settings;
      return await ctx.call('pod-collections.getCollectionUriFromResource', {
        resource,
        attachPredicate
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
    },
    getGroupSlugFromCollectionUri(collectionUri) {
      const urlObject = new URL(collectionUri);
      const parts = urlObject.pathname.split('/');
      if (parts[2] === 'data') {
        // Transforms http://localhost:3000/alice/data/e8c183f8-4e16-4aed/likes to e8c183f8-4e16-4aed/likes
        return parts.slice(3).join('/');
      } else {
        // Transforms http://localhost:3000/alice/folowers to followers
        return parts.slice(2).join('/');
      }
    }
  }
};

export default Schema;
