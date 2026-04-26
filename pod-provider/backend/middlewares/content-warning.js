'use strict';

const { normalizeActivityContentWarning } = require('../utils/content-warning');

const ContentWarningMiddleware = () => ({
  name: 'ContentWarningMiddleware',
  localAction: (next, action) => {
    if (action.name !== 'activitypub.outbox.post' && action.name !== 'activitypub.inbox.post') {
      return next;
    }

    return async ctx => {
      if (!ctx.params || typeof ctx.params !== 'object') {
        return next(ctx);
      }

      const { collectionUri, ...activity } = ctx.params;
      const normalized = normalizeActivityContentWarning(activity);

      if (normalized !== activity) {
        ctx.params = collectionUri ? { collectionUri, ...normalized } : normalized;
      }

      return next(ctx);
    };
  }
});

module.exports = ContentWarningMiddleware;
