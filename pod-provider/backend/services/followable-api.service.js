'use strict';

const { Errors } = require('moleculer');
const { FOLLOWABLE_ERRORS } = require('../utils/followable');

const { MoleculerError } = Errors;

module.exports = {
  name: 'followable-api',
  dependencies: ['api', 'followable'],

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        path: '/api/followable',
        authorization: true,
        authentication: true,
        bodyParsers: { json: { strict: false } },
        aliases: {
          'POST /follow': 'followable-api.follow',
          'POST /resolve': 'followable-api.resolve'
        }
      },
      toBottom: false
    });

    this.logger.info('[FollowableApi] Routes POST /api/followable/follow and /api/followable/resolve registered');
  },

  actions: {
    resolve: {
      params: {
        objectUri: { type: 'string', optional: true },
        object: { type: 'object', optional: true },
        recursionLimit: { type: 'number', integer: true, optional: true, convert: true, min: 0 },
        requireFollowersCollection: { type: 'boolean', optional: true }
      },
      async handler(ctx) {
        try {
          return await ctx.call('followable.resolveTarget', {
            objectUri: ctx.params.objectUri,
            object: ctx.params.object,
            recursionLimit: ctx.params.recursionLimit,
            requireFollowersCollection: ctx.params.requireFollowersCollection,
            webId: ctx.meta.webId
          });
        } catch (error) {
          throw this.toApiError(error);
        }
      }
    },

    follow: {
      params: {
        objectUri: { type: 'string', optional: true },
        object: { type: 'object', optional: true },
        recursionLimit: { type: 'number', integer: true, optional: true, convert: true, min: 0 },
        requireFollowersCollection: { type: 'boolean', optional: true }
      },
      async handler(ctx) {
        const followerActorUri = ctx.meta.webId;
        if (!followerActorUri || followerActorUri === 'anon') {
          throw new MoleculerError('Authentication required to follow objects', 401, 'UNAUTHORIZED');
        }

        try {
          const result = await ctx.call('followable.followObject', {
            followerActorUri,
            objectUri: ctx.params.objectUri,
            object: ctx.params.object,
            recursionLimit: ctx.params.recursionLimit,
            requireFollowersCollection: ctx.params.requireFollowersCollection,
            webId: followerActorUri
          });

          ctx.meta.$statusCode = 202;
          return result;
        } catch (error) {
          throw this.toApiError(error);
        }
      }
    }
  },

  methods: {
    toApiError(error) {
      const code = error?.code;
      if (code === FOLLOWABLE_ERRORS.OBJECT_HAS_UNKNOWN_FOLLOWERS_COLLECTION) {
        return new MoleculerError(error.message, 409, code);
      }
      if (code === FOLLOWABLE_ERRORS.MAX_RECURSION_LIMIT) {
        return new MoleculerError(error.message, 422, code);
      }
      if (code === FOLLOWABLE_ERRORS.TARGET_NOT_RESOLVABLE) {
        return new MoleculerError(error.message, 404, code);
      }

      const statusCode = Number.isFinite(Number(error?.code)) ? Number(error.code) : 500;
      const type = typeof error?.type === 'string' ? error.type : 'FOLLOWABLE_API_ERROR';
      return new MoleculerError(error?.message || 'Unable to process follow request', statusCode, type);
    }
  }
};
