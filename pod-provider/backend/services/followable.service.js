'use strict';

const { MIME_TYPES } = require('@semapps/mime-types');
const {
  FOLLOWABLE_ERRORS,
  firstIri,
  getObjectType,
  isActorType,
  normalizeRecursionLimit,
  resolveFollowDeliveryTarget
} = require('../utils/followable');

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
        const resolved = await this.resolveTarget(ctx, {
          objectUri,
          object,
          recursionLimit,
          requireFollowersCollection,
          webId
        });

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
        const resolved = await this.resolveTarget(ctx, {
          objectUri,
          object: targetObject,
          recursionLimit,
          requireFollowersCollection,
          webId
        });

        const follower = await ctx.call('activitypub.actor.get', { actorUri: followerActorUri });
        if (!follower || !normalizeIri(follower.outbox)) {
          const error = new Error(`Follower actor outbox is not available for ${followerActorUri}`);
          error.code = FOLLOWABLE_ERRORS.TARGET_NOT_RESOLVABLE;
          throw error;
        }

        const objectId = resolved.objectId || normalizeIri(objectUri) || resolved.recipientUri;
        const followObject = this.buildFollowObjectPayload(targetObject, resolved, objectId);

        const result = await ctx.call('activitypub.outbox.post', {
          collectionUri: follower.outbox,
          type: 'Follow',
          actor: followerActorUri,
          object: followObject,
          to: resolved.recipientUri
        });

        return {
          success: true,
          followActivity: result,
          resolved
        };
      }
    },

    resolveFollowActivityDelivery: {
      params: {
        activity: { type: 'object' },
        recursionLimit: { type: 'number', integer: true, optional: true, convert: true, min: 0 },
        requireFollowersCollection: { type: 'boolean', optional: true },
        webId: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const { activity, recursionLimit, requireFollowersCollection, webId } = ctx.params;
        const activityType = activity && typeof activity === 'object' ? activity.type || activity['@type'] : null;
        if (activityType !== 'Follow') {
          const error = new Error('Activity must be a Follow to resolve followable delivery');
          error.code = FOLLOWABLE_ERRORS.TARGET_NOT_RESOLVABLE;
          throw error;
        }

        const { objectUri, object } = this.extractFollowObjectReference(activity);
        const resolved = await this.resolveTarget(ctx, {
          objectUri,
          object,
          recursionLimit,
          requireFollowersCollection,
          webId
        });

        return {
          success: true,
          resolved,
          delivery: this.toActivityPubDeliveryTarget(resolved)
        };
      }
    }
  },

  methods: {
    async resolveTarget(ctx, { objectUri, object, recursionLimit, requireFollowersCollection, webId }) {
      const targetObject = object || (await this.loadObject(ctx, objectUri, webId));

      return resolveFollowDeliveryTarget(
        targetObject,
        async uri => this.loadObject(ctx, uri, webId),
        {
          recursionLimit: normalizeRecursionLimit(recursionLimit),
          requireFollowersCollection
        }
      );
    },

    extractFollowObjectReference(activity) {
      const followObject = activity && typeof activity === 'object' ? activity.object : null;
      if (followObject && typeof followObject === 'object' && !Array.isArray(followObject)) {
        return {
          objectUri: firstIri(followObject.id) || firstIri(followObject['@id']) || null,
          object: followObject
        };
      }

      return {
        objectUri: normalizeIri(followObject),
        object: null
      };
    },

    buildFollowObjectPayload(targetObject, resolved, fallbackObjectId) {
      const objectId = resolved.objectId || normalizeIri(fallbackObjectId) || null;
      if (!targetObject || !objectId) {
        return objectId || resolved.recipientUri;
      }

      const objectType = getObjectType(targetObject);
      if (isActorType(objectType)) {
        return objectId;
      }

      const payload = { id: objectId };
      if (objectType) payload.type = objectType;
      if (resolved.followersUri) payload.followers = resolved.followersUri;

      const inboxUri = firstIri(targetObject.inbox);
      if (inboxUri) payload.inbox = inboxUri;

      const attributedTo = firstIri(targetObject.attributedTo);
      if (attributedTo) payload.attributedTo = attributedTo;

      if (Object.keys(payload).length === 1) {
        return objectId;
      }

      return payload;
    },

    toActivityPubDeliveryTarget(resolved) {
      const inboxUrl = normalizeIri(resolved.inboxUri);
      if (!inboxUrl) {
        const error = new Error('Follow target inbox is not resolvable');
        error.code = FOLLOWABLE_ERRORS.TARGET_NOT_RESOLVABLE;
        throw error;
      }

      return {
        actor: resolved.recipientUri,
        targetDomain: new URL(inboxUrl).hostname,
        recipients: [inboxUrl]
      };
    },

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
