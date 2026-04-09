'use strict';

const { MIME_TYPES } = require('@semapps/mime-types');
const { FOLLOWABLE_ERRORS, resolveFollowDeliveryTarget } = require('../utils/followable');

const normalizeIri = value => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

module.exports = {
  name: 'followable',

  actions: {
    resolveTarget: {
      params: {
        objectUri: { type: 'string', optional: true },
        object: { type: 'object', optional: true },
        recursionLimit: { type: 'number', integer: true, optional: true, convert: true, min: 0 },
        requireFollowersCollection: { type: 'boolean', optional: true },
        webId: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const { objectUri, object, recursionLimit, requireFollowersCollection, webId } = ctx.params;
        const targetObject = object || (await this.loadObject(ctx, objectUri, webId));

        const resolved = await resolveFollowDeliveryTarget(
          targetObject,
          async uri => this.loadObject(ctx, uri, webId),
          {
            recursionLimit,
            requireFollowersCollection
          }
        );

        return {
          success: true,
          ...resolved
        };
      }
    },

    followObject: {
      params: {
        followerActorUri: { type: 'string' },
        objectUri: { type: 'string', optional: true },
        object: { type: 'object', optional: true },
        recursionLimit: { type: 'number', integer: true, optional: true, convert: true, min: 0 },
        requireFollowersCollection: { type: 'boolean', optional: true },
        webId: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const { followerActorUri, objectUri, object, recursionLimit, requireFollowersCollection, webId } = ctx.params;

        const targetObject = object || (await this.loadObject(ctx, objectUri, webId));
        const resolved = await resolveFollowDeliveryTarget(
          targetObject,
          async uri => this.loadObject(ctx, uri, webId),
          {
            recursionLimit,
            requireFollowersCollection
          }
        );

        const follower = await ctx.call('activitypub.actor.get', { actorUri: followerActorUri });
        if (!follower || !normalizeIri(follower.outbox)) {
          const error = new Error(`Follower actor outbox is not available for ${followerActorUri}`);
          error.code = FOLLOWABLE_ERRORS.TARGET_NOT_RESOLVABLE;
          throw error;
        }

        const objectId = resolved.objectId || normalizeIri(objectUri) || resolved.recipientUri;

        const result = await ctx.call('activitypub.outbox.post', {
          collectionUri: follower.outbox,
          type: 'Follow',
          actor: followerActorUri,
          object: objectId,
          to: resolved.recipientUri
        });

        return {
          success: true,
          followActivity: result,
          resolved
        };
      }
    }
  },

  methods: {
    async loadObject(ctx, resourceUri, webId) {
      const uri = normalizeIri(resourceUri);
      if (!uri) return null;

      // Keep remote cache fresh before reading JSON representation.
      try {
        await ctx.call('ldp.remote.store', {
          resourceUri: uri,
          webId: webId || 'system'
        });
      } catch (error) {
        this.logger.debug('[followable] remote store skipped', { resourceUri: uri, error: error.message });
      }

      try {
        const resource = await ctx.call('ldp.resource.get', {
          resourceUri: uri,
          accept: MIME_TYPES.JSON,
          webId: webId || 'system'
        });
        if (resource && typeof resource === 'object') {
          return resource;
        }
      } catch (error) {
        this.logger.debug('[followable] ldp.resource.get failed', { resourceUri: uri, error: error.message });
      }

      try {
        const actor = await ctx.call('activitypub.actor.get', { actorUri: uri });
        if (actor && typeof actor === 'object') {
          return actor;
        }
      } catch (error) {
        this.logger.debug('[followable] activitypub.actor.get failed', { resourceUri: uri, error: error.message });
      }

      return null;
    }
  }
};
