'use strict';

const { MIME_TYPES } = require('@semapps/mime-types');
const CONFIG = require('../config/config');
const { retryWithBackoff } = require('../utils/backoff');
const {
  buildArticleShareUrl,
  hasArticleType,
  shouldBackfillArticleShareUrl,
  withPreferredArticleShareUrl
} = require('../utils/article-share');

module.exports = {
  name: 'article-share-linker',

  dependencies: ['ldp.resource'],

  events: {
    'activitypub.outbox.posted': {
      async handler(ctx) {
        const article = this.extractArticleObject(ctx.params?.activity);
        if (!article) return;

        const objectUri = this.extractObjectUri(article);
        if (!objectUri) return;

        const shareUrl = buildArticleShareUrl(CONFIG.BASE_URL, objectUri);
        if (!shareUrl) return;
        if (!shouldBackfillArticleShareUrl(article, objectUri, shareUrl)) return;

        const nextArticle = withPreferredArticleShareUrl(article, objectUri, shareUrl);
        const meta = {
          webId: 'system',
          skipObjectsWatcher: true
        };

        if (typeof ctx.meta?.dataset === 'string' && ctx.meta.dataset.length > 0) {
          meta.dataset = ctx.meta.dataset;
        }
        if (typeof ctx.meta?.podDataset === 'string' && ctx.meta.podDataset.length > 0) {
          meta.dataset = ctx.meta.podDataset;
        }

        try {
          await retryWithBackoff(
            async () =>
              ctx.call(
                'ldp.resource.put',
                {
                  resourceUri: objectUri,
                  resource: nextArticle,
                  contentType: MIME_TYPES.JSON,
                  webId: 'system'
                },
                { meta }
              ),
            {
              maxRetries: 2,
              baseDelayMs: 100,
              maxDelayMs: 1000,
              retryIf: error => error?.code === 429 || error?.code >= 500
            }
          );
        } catch (error) {
          this.logger.warn('[article-share-linker] Failed to backfill article share URL', {
            objectUri,
            shareUrl,
            error: error?.message
          });
        }
      }
    }
  },

  methods: {
    extractArticleObject(activity) {
      if (!activity || typeof activity !== 'object') return null;
      if (hasArticleType(activity)) return activity;

      const type = activity.type || activity['@type'];
      if (type !== 'Create' && type !== 'Update') return null;
      const object = activity.object;
      return hasArticleType(object) ? object : null;
    },

    extractObjectUri(object) {
      if (!object || typeof object !== 'object') return null;
      const value = typeof object.id === 'string' ? object.id : object['@id'];
      return typeof value === 'string' && value.startsWith('http') ? value : null;
    }
  }
};
