'use strict';

const {
  normalizeActorMetadataAttachments,
  annotateActorMetadataVerification,
  hasActorType,
  hasRelMeLinkMetadata
} = require('../utils/actor-metadata');

const OBJECT_BEARING_TYPES = new Set(['Create', 'Update']);

const normalizeActivityObject = activity => {
  if (!activity || typeof activity !== 'object') return activity;

  const isWrapped = OBJECT_BEARING_TYPES.has(activity.type) || OBJECT_BEARING_TYPES.has(activity['@type']);
  if (isWrapped && activity.object && typeof activity.object === 'object') {
    const normalizedObject = normalizeActorMetadataAttachments(activity.object);
    if (normalizedObject === activity.object) return activity;
    return { ...activity, object: normalizedObject };
  }

  if (hasActorType(activity)) {
    return normalizeActorMetadataAttachments(activity);
  }

  return activity;
};

const maybeAnnotateVerification = async (ctx, actor) => {
  if (!actor || typeof actor !== 'object') return actor;
  if (!hasActorType(actor) || !hasRelMeLinkMetadata(actor)) return actor;
  if (typeof ctx?.call !== 'function') return actor;

  const actorUri =
    (typeof actor.id === 'string' && actor.id) ||
    (typeof actor['@id'] === 'string' && actor['@id']) ||
    (typeof ctx?.params?.actorUri === 'string' && ctx.params.actorUri) ||
    null;
  if (!actorUri) return actor;

  const account = await Promise.resolve(ctx.call('auth.account.findByWebId', { webId: actorUri })).catch(() => null);
  if (!account?.webId) return actor;

  const verification = await Promise.resolve(
    ctx.call('actor-metadata-verification.verifyActorMetadata', {
      actorUri,
      actor
    })
  ).catch(() => null);

  if (!verification) return actor;
  return annotateActorMetadataVerification(actor, verification);
};

/**
 * ActorMetadataMiddleware
 *
 * Implements FEP-fb2a normalization at AP service boundaries:
 *   - outbound actor-bearing activities (activitypub.outbox.post)
 *   - inbound actor-bearing activities (activitypub.inbox.post)
 *   - direct actor reads (activitypub.actor.get, activitypub.actor.getProfile)
 */
const ActorMetadataMiddleware = () => ({
  name: 'ActorMetadataMiddleware',

  localAction: (next, action) => {
    const shouldNormalizeParams =
      action.name === 'activitypub.outbox.post' ||
      action.name === 'activitypub.inbox.post';

    const shouldNormalizeResult =
      action.name === 'activitypub.actor.get' ||
      action.name === 'activitypub.actor.getProfile';

    if (!shouldNormalizeParams && !shouldNormalizeResult) {
      return next;
    }

    return async ctx => {
      if (shouldNormalizeParams && ctx.params && typeof ctx.params === 'object') {
        const { collectionUri, ...activity } = ctx.params;
        const normalized = normalizeActivityObject(activity);
        if (normalized !== activity) {
          ctx.params = collectionUri ? { collectionUri, ...normalized } : normalized;
        }
      }

      const result = await next(ctx);

      if (shouldNormalizeResult && result && typeof result === 'object') {
        const normalized = normalizeActorMetadataAttachments(result);
        return maybeAnnotateVerification(ctx, normalized);
      }

      return result;
    };
  },
});

module.exports = ActorMetadataMiddleware;
