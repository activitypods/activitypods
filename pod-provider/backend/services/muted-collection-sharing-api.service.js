const { MoleculerError } = require('moleculer').Errors;

module.exports = {
  name: 'muted-collection-sharing-api',
  dependencies: ['api', 'activitypub.muted'],

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        path: '/api/mute-lists',
        authorization: true,
        authentication: true,
        bodyParsers: { json: { strict: false, limit: '16kb' } },
        aliases: {
          'GET /muted/visibility': 'muted-collection-sharing-api.getVisibility',
          'PUT /muted/visibility': 'muted-collection-sharing-api.setVisibility'
        }
      },
      toBottom: false
    });
  },

  actions: {
    getVisibility: {
      async handler(ctx) {
        const actorUri = this.requireAuthenticatedActor(ctx);
        const state = await ctx.call('activitypub.muted.getMutedCollectionSharingState', {
          actorUri
        });

        return {
          public: state?.public === true,
          collectionUri: state?.collectionUri || `${actorUri}/muted`,
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
        const state = await ctx.call('activitypub.muted.setMutedCollectionPublic', {
          actorUri,
          isPublic: ctx.params.public
        });

        ctx.meta.$statusCode = 200;
        return {
          public: state?.public === true,
          collectionUri: state?.collectionUri || `${actorUri}/muted`,
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
