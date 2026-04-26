const { MoleculerError } = require('moleculer').Errors;

module.exports = {
  name: 'blocked-collection-sharing-api',
  dependencies: ['api', 'activitypub.blocked'],

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        path: '/api/block-lists',
        authorization: true,
        authentication: true,
        bodyParsers: { json: { strict: false, limit: '16kb' } },
        aliases: {
          'GET /blocked/visibility': 'blocked-collection-sharing-api.getVisibility',
          'PUT /blocked/visibility': 'blocked-collection-sharing-api.setVisibility'
        }
      },
      toBottom: false
    });
  },

  actions: {
    getVisibility: {
      async handler(ctx) {
        const actorUri = this.requireAuthenticatedActor(ctx);
        const state = await ctx.call('activitypub.blocked.getBlockedCollectionSharingState', {
          actorUri
        });

        return {
          public: state?.public === true,
          collectionUri: state?.collectionUri || `${actorUri}/blocked`,
          followersCollectionUri: state?.followersCollectionUri || null
        };
      }
    },
    setVisibility: {
      params: {
        public: { type: 'boolean', convert: true }
      },
      async handler(ctx) {
        const actorUri = this.requireAuthenticatedActor(ctx);
        const state = await ctx.call('activitypub.blocked.setBlockedCollectionPublic', {
          actorUri,
          isPublic: ctx.params.public
        });

        ctx.meta.$statusCode = 200;
        return {
          public: state?.public === true,
          collectionUri: state?.collectionUri || `${actorUri}/blocked`,
          followersCollectionUri: state?.followersCollectionUri || null
        };
      }
    }
  },

  methods: {
    requireAuthenticatedActor(ctx) {
      const actorUri = typeof ctx.meta?.webId === 'string' ? ctx.meta.webId.trim() : '';
      if (!actorUri || actorUri === 'anon') {
        throw new MoleculerError('Authentication required', 401, 'UNAUTHORIZED');
      }
      return actorUri;
    }
  }
};
