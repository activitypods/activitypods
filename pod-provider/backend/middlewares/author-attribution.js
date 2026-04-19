'use strict';

const {
  hasActorType,
  normalizeActorAuthorAttributionForOutput
} = require('../utils/author-attribution');

const OBJECT_BEARING_TYPES = new Set(['Create', 'Update']);

const normalizeActivityObject = activity => {
  if (!activity || typeof activity !== 'object') return activity;

  const type = activity.type || activity['@type'];
  if (OBJECT_BEARING_TYPES.has(type) && activity.object && typeof activity.object === 'object') {
    const normalizedObject = normalizeActorAuthorAttributionForOutput(activity.object);
    if (normalizedObject === activity.object) return activity;
    return { ...activity, object: normalizedObject };
  }

  if (hasActorType(activity)) {
    return normalizeActorAuthorAttributionForOutput(activity);
  }

  return activity;
};

const AuthorAttributionMiddleware = () => ({
  name: 'AuthorAttributionMiddleware',

  localAction: (next, action) => {
    const shouldNormalizeParams = action.name === 'activitypub.outbox.post' || action.name === 'activitypub.inbox.post';
    const shouldNormalizeResult =
      action.name === 'activitypub.actor.get' || action.name === 'activitypub.actor.getProfile';

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
        return normalizeActorAuthorAttributionForOutput(result);
      }

      return result;
    };
  }
});

module.exports = AuthorAttributionMiddleware;
