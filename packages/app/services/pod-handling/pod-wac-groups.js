module.exports = {
  name: 'pod-wac-groups',
  mixins: [FetchPodOrProxyMixin],
  actions: {
    async get(ctx) {
      const { groupSlug, actorUri } = ctx.params;

      const { body, status } = await this.actions.fetch({
        url: this.getGroupUri(groupSlug, actorUri),
        headers: {
          Accept: 'application/ld+json'
        },
        actorUri
      });

      return status === 200 ? body['@graph'] : false;
    },
    async create(ctx) {
      const { groupSlug, actorUri } = ctx.params;

      const { origin } = new URL(podOwner);

      const { body } = await this.actions.fetch({
        url: `${origin}/_groups`,
        method: 'POST',
        headers: {
          Slug: groupSlug
        },
        actorUri
      });

      return body;
    },
    async delete(ctx) {
      const { groupSlug, actorUri } = ctx.params;

      const { status } = await this.actions.fetch({
        url: this.getGroupUri(groupSlug, actorUri),
        method: 'DELETE',
        actorUri
      });

      return status === 204;
    }
  },
  methods: {
    // Return URL like http://localhost:3000/_groups/alice/contacts
    async getGroupUri(groupSlug, podOwner) {
      const { origin, pathname } = new URL(podOwner);
      return `${origin}/groups${pathname}/${groupSlug}`;
    }
  }
};
