'use strict';

const { MIME_TYPES } = require('@semapps/mime-types');
const CONFIG = require('../config/config');
const {
  buildArticleShareUrl,
  extractPrimaryActorUri,
  hasArticleType,
  renderArticleShareHtml
} = require('../utils/article-share');

module.exports = {
  name: 'article-share-pages',

  dependencies: ['api', 'ldp.resource', 'activitypub.actor'],

  settings: {
    routePath: '/posts'
  },

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        name: 'article-share-pages',
        path: this.settings.routePath,
        authorization: false,
        authentication: false,
        bodyParsers: { json: false },
        aliases: {
          'GET /:postId/share': 'article-share-pages.render'
        }
      },
      toBottom: false
    });
  },

  actions: {
    render: {
      async handler(ctx) {
        const postId = this.normalizePostId(ctx.params?.postId);
        if (!postId) {
          ctx.meta.$statusCode = 400;
          return 'Invalid post identifier';
        }

        const objectUri = this.buildObjectUri(postId);
        if (!objectUri) {
          ctx.meta.$statusCode = 500;
          return 'Post origin is not configured';
        }

        const article = await this.fetchArticle(ctx, objectUri);
        if (!article) {
          ctx.meta.$statusCode = 404;
          return 'Article not found';
        }

        const actorUri = extractPrimaryActorUri(article);
        const actor = actorUri ? await this.fetchActor(ctx, actorUri) : null;
        const shareUrl = this.resolveShareUrl(ctx, objectUri, postId);
        const html = renderArticleShareHtml({
          shareUrl,
          objectUri,
          article,
          actor,
          instanceName: CONFIG.INSTANCE_NAME
        });

        ctx.meta.$statusCode = 200;
        ctx.meta.$responseType = 'text/html; charset=utf-8';
        ctx.meta.$responseHeaders = {
          ...(ctx.meta.$responseHeaders || {}),
          'Cache-Control': 'public, max-age=120, stale-while-revalidate=60',
          'Content-Security-Policy':
            "default-src 'none'; img-src https: http: data:; media-src https: http: data:; style-src 'unsafe-inline'; font-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'; script-src 'none'",
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          Link: `<${objectUri}>; rel=\"alternate\"; type=\"application/activity+json\"`
        };

        return html;
      }
    }
  },

  methods: {
    normalizePostId(value) {
      const normalized = Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
      if (!normalized || normalized.length > 200 || normalized.includes('/')) return null;
      return normalized;
    },

    buildObjectUri(postId) {
      const baseUrl = typeof CONFIG.BASE_URL === 'string' ? CONFIG.BASE_URL.trim().replace(/\/+$/, '') : '';
      if (!baseUrl) return null;
      return `${baseUrl}/posts/${encodeURIComponent(postId)}`;
    },

    resolveShareUrl(ctx, objectUri, postId) {
      const requestOrigin = this.resolveRequestOrigin(ctx);
      const preferred = buildArticleShareUrl(requestOrigin || CONFIG.BASE_URL, objectUri);
      return (
        preferred || `${String(CONFIG.BASE_URL || '').replace(/\/+$/, '')}/posts/${encodeURIComponent(postId)}/share`
      );
    },

    resolveRequestOrigin(ctx) {
      const headers = ctx.meta?.$headers || {};
      const forwardedProto = this.readHeader(headers, 'x-forwarded-proto');
      const forwardedHost = this.readHeader(headers, 'x-forwarded-host');
      const host = forwardedHost || this.readHeader(headers, 'host');
      const proto = forwardedProto || 'https';

      if (!host || /\s|\/|:\/\//.test(host)) return null;

      try {
        return new URL(`${proto}://${host}`).origin;
      } catch {
        return null;
      }
    },

    readHeader(headers, key) {
      if (!headers || typeof headers !== 'object') return null;
      const direct = headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
      if (typeof direct === 'string' && direct.trim()) return direct.trim();
      if (Array.isArray(direct) && typeof direct[0] === 'string' && direct[0].trim()) return direct[0].trim();
      return null;
    },

    async fetchArticle(ctx, objectUri) {
      try {
        const article = await ctx.call('ldp.resource.get', {
          resourceUri: objectUri,
          accept: MIME_TYPES.JSON,
          webId: 'anon'
        });
        return hasArticleType(article) ? article : null;
      } catch {
        return null;
      }
    },

    async fetchActor(ctx, actorUri) {
      try {
        return await ctx.call('activitypub.actor.get', {
          actorUri,
          webId: 'anon'
        });
      } catch {
        return null;
      }
    }
  }
};
