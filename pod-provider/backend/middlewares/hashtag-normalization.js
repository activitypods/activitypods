const { hasType } = require('@semapps/ldp');
const { normalizeActivityPubObjectHashtags } = require('../utils/hashtags');
const { normalizeEmojiReactionActivity } = require('../utils/emoji-reactions');

const shouldNormalizeActivityObject = activity => {
  if (!activity || typeof activity !== 'object') {
    return false;
  }

  if (hasType(activity, 'Create') || hasType(activity, 'Update')) {
    return activity.object && typeof activity.object === 'object';
  }

  return hasType(activity, 'Note') || hasType(activity, 'Article');
};

const normalizeParams = params => {
  if (!params || typeof params !== 'object') {
    return params;
  }

  const { collectionUri, ...activity } = params;
  let nextActivity = normalizeEmojiReactionActivity(activity);

  if (hasType(nextActivity, 'Undo') && nextActivity.object && typeof nextActivity.object === 'object') {
    nextActivity = {
      ...nextActivity,
      object: normalizeEmojiReactionActivity(nextActivity.object)
    };
  }

  if (!shouldNormalizeActivityObject(nextActivity)) {
    return {
      collectionUri,
      ...nextActivity
    };
  }

  if (nextActivity.object && typeof nextActivity.object === 'object') {
    nextActivity = {
      ...nextActivity,
      object: normalizeActivityPubObjectHashtags(nextActivity.object)
    };
  } else if (hasType(nextActivity, 'Note')) {
    nextActivity = normalizeActivityPubObjectHashtags(nextActivity);
  }

  return {
    collectionUri,
    ...nextActivity
  };
};

const HashtagNormalizationMiddleware = () => ({
  name: 'HashtagNormalizationMiddleware',
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

module.exports = HashtagNormalizationMiddleware;
