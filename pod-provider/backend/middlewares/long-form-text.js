'use strict';

const { hasType } = require('@semapps/ldp');
const { normalizeLongFormActivity } = require('../utils/long-form-text');

const shouldNormalize = activity => {
  if (!activity || typeof activity !== 'object') {
    return false;
  }

  if (hasType(activity, 'Create') || hasType(activity, 'Update')) {
    return !!(activity.object && typeof activity.object === 'object');
  }

  return hasType(activity, 'Article');
};

const normalizeParams = params => {
  if (!params || typeof params !== 'object') {
    return params;
  }

  const { collectionUri, ...activity } = params;

  if (!shouldNormalize(activity)) {
    return {
      collectionUri,
      ...activity
    };
  }

  const normalized = normalizeLongFormActivity(activity);

  return {
    collectionUri,
    ...normalized
  };
};

const LongFormTextMiddleware = () => ({
  name: 'LongFormTextMiddleware',
  localAction: (next, action) => {
    if (action.name !== 'activitypub.outbox.post' && action.name !== 'activitypub.inbox.post') {
      return next;
    }

    return async ctx => {
      ctx.params = normalizeParams(ctx.params);
      return next(ctx);
    };
  }
});

module.exports = LongFormTextMiddleware;
