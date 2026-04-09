'use strict';

/**
 * QuotePostsMiddleware — FEP-dd4b
 *
 * Intercepts both outbox and inbox Announce activities that carry `content`
 * (quote posts) and:
 *   1. Sanitizes/normalizes the activity via normalizeQuotePost()
 *   2. After the activity is stored (post next(ctx)), notifies the shares
 *      collection manager so the Announce is counted against the quoted
 *      object's shares collection (spec: "SHOULD be counted as part of the
 *      shares collection").
 *
 * Plain Announce activities with no content (simple boosts) are left
 * completely untouched — this middleware only handles quote posts.
 */

const { isQuotePost, normalizeQuotePost, getQuoteObjectIri } = require('../utils/quote-posts');

const QuotePostsMiddleware = () => ({
  name: 'QuotePostsMiddleware',
  localAction: (next, action) => {
    if (action.name !== 'activitypub.outbox.post' && action.name !== 'activitypub.inbox.post') {
      return next;
    }

    return async ctx => {
      if (!ctx.params || typeof ctx.params !== 'object') {
        return next(ctx);
      }

      const { collectionUri, ...activity } = ctx.params;

      if (!isQuotePost(activity)) {
        return next(ctx);
      }

      // Normalize: sanitize content, validate tags, resolve inReplyTo
      const normalized = normalizeQuotePost(activity);
      if (normalized !== activity) {
        ctx.params = collectionUri ? { collectionUri, ...normalized } : normalized;
      }

      const result = await next(ctx);

      // After storage: register with shares collection if the service is available
      const canCallServices = typeof ctx.call === 'function';
      if (canCallServices) {
        const quotedObjectIri = getQuoteObjectIri(normalized);
        if (quotedObjectIri) {
          // best-effort: failure must not abort the activity
          try {
            await ctx.call('activitypub.collection.attach', {
              collectionUri: `${quotedObjectIri}/shares`,
              item: normalized.id || normalized['@id']
            });
          } catch {
            // shares collection may not exist on this server; that is fine
          }
        }
      }

      return result;
    };
  }
});

module.exports = QuotePostsMiddleware;
