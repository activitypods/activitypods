const CONFIG = require('../config/config');

const AP_ACCEPT = 'application/activity+json, application/ld+json, application/json';

const buildBaseOrigin = () => String(CONFIG.BASE_URL || '').replace(/\/$/, '');

const xmlEscape = value =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const extractFirstUrl = value => {
  if (typeof value === 'string' && value.length > 0) return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractFirstUrl(item);
      if (found) return found;
    }
    return null;
  }

  if (value && typeof value === 'object') {
    const fromId = extractFirstUrl(value.id);
    if (fromId) return fromId;
    return extractFirstUrl(value.url);
  }

  return null;
};

const toEntries = (payload, fallbackUrl) => {
  const entries = [];

  const pushEntry = value => {
    if (typeof value === 'string') {
      entries.push({ id: value, url: value, title: value });
      return;
    }

    if (!value || typeof value !== 'object') return;

    const id = extractFirstUrl(value.id) || extractFirstUrl(value.url);
    if (!id) return;

    const title =
      (typeof value.name === 'string' && value.name.trim().length > 0 && value.name) ||
      (typeof value.summary === 'string' && value.summary.trim().length > 0 && value.summary) ||
      id;

    const summary =
      typeof value.summary === 'string'
        ? value.summary
        : typeof value.content === 'string'
          ? value.content
          : undefined;

    const publishedAt =
      typeof value.published === 'string'
        ? value.published
        : typeof value.updated === 'string'
          ? value.updated
          : undefined;

    entries.push({
      id,
      url: extractFirstUrl(value.url) || id,
      title,
      summary,
      publishedAt
    });
  };

  if (payload && typeof payload === 'object') {
    const items = payload.orderedItems || payload.items;
    if (Array.isArray(items)) {
      items.slice(0, 20).forEach(pushEntry);
    } else {
      pushEntry(payload);
    }
  }

  if (entries.length === 0) {
    entries.push({
      id: fallbackUrl,
      url: fallbackUrl,
      title: fallbackUrl,
      publishedAt: new Date().toISOString()
    });
  }

  return entries;
};

const toRss = (feedUrl, entries) => {
  const now = new Date().toUTCString();
  const itemsXml = entries
    .map(entry => {
      const pubDate = new Date(entry.publishedAt || Date.now()).toUTCString();
      const description = entry.summary ? `<description>${xmlEscape(entry.summary)}</description>` : '';

      return `<item>
  <title>${xmlEscape(entry.title)}</title>
  <link>${xmlEscape(entry.url)}</link>
  <guid>${xmlEscape(entry.id)}</guid>
  <pubDate>${xmlEscape(pubDate)}</pubDate>
  ${description}
</item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
  <title>${xmlEscape(feedUrl)}</title>
  <link>${xmlEscape(feedUrl)}</link>
  <description>Fediverse syndication feed</description>
  <lastBuildDate>${xmlEscape(now)}</lastBuildDate>
${itemsXml}
</channel>
</rss>`;
};

const toAtom = (feedUrl, entries) => {
  const updated = entries[0]?.publishedAt || new Date().toISOString();
  const entriesXml = entries
    .map(entry => {
      const entryUpdated = entry.publishedAt || updated;
      const summary = entry.summary ? `<summary>${xmlEscape(entry.summary)}</summary>` : '';
      return `<entry>
  <id>${xmlEscape(entry.id)}</id>
  <title>${xmlEscape(entry.title)}</title>
  <link href="${xmlEscape(entry.url)}" />
  <updated>${xmlEscape(entryUpdated)}</updated>
  ${summary}
</entry>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${xmlEscape(feedUrl)}</id>
  <title>${xmlEscape(feedUrl)}</title>
  <updated>${xmlEscape(updated)}</updated>
  <link rel="self" href="${xmlEscape(feedUrl)}" />
${entriesXml}
</feed>`;
};

module.exports = {
  name: 'syndication-api',
  dependencies: ['api'],

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        name: 'syndication-users',
        path: '/users',
        aliases: {
          'GET /:identifier.rss': 'syndication-api.userRss',
          'GET /:identifier.atom': 'syndication-api.userAtom',
          'GET /:identifier/outbox.rss': 'syndication-api.userOutboxRss',
          'GET /:identifier/outbox.atom': 'syndication-api.userOutboxAtom'
        }
      }
    });

    await this.broker.call('api.addRoute', {
      route: {
        name: 'syndication-posts',
        path: '/posts',
        aliases: {
          'GET /:postId.rss': 'syndication-api.postRss',
          'GET /:postId.atom': 'syndication-api.postAtom'
        }
      }
    });

    await this.broker.call('api.addRoute', {
      route: {
        name: 'syndication-handles',
        path: '/@',
        aliases: {
          'GET /:identifier.rss': 'syndication-api.handleRss',
          'GET /:identifier.atom': 'syndication-api.handleAtom',
          'GET /:identifier@:domain.rss': 'syndication-api.mirroredHandleRss',
          'GET /:identifier@:domain.atom': 'syndication-api.mirroredHandleAtom'
        }
      }
    });
  },

  actions: {
    async userRss(ctx) {
      return this.renderFeed(ctx, 'rss', `/users/${encodeURIComponent(String(ctx.params.identifier))}`);
    },
    async userAtom(ctx) {
      return this.renderFeed(ctx, 'atom', `/users/${encodeURIComponent(String(ctx.params.identifier))}`);
    },
    async userOutboxRss(ctx) {
      return this.renderFeed(ctx, 'rss', `/users/${encodeURIComponent(String(ctx.params.identifier))}/outbox`);
    },
    async userOutboxAtom(ctx) {
      return this.renderFeed(ctx, 'atom', `/users/${encodeURIComponent(String(ctx.params.identifier))}/outbox`);
    },
    async postRss(ctx) {
      return this.renderFeed(ctx, 'rss', `/posts/${encodeURIComponent(String(ctx.params.postId))}`);
    },
    async postAtom(ctx) {
      return this.renderFeed(ctx, 'atom', `/posts/${encodeURIComponent(String(ctx.params.postId))}`);
    },
    async handleRss(ctx) {
      return this.renderFeed(ctx, 'rss', `/@${encodeURIComponent(String(ctx.params.identifier))}`);
    },
    async handleAtom(ctx) {
      return this.renderFeed(ctx, 'atom', `/@${encodeURIComponent(String(ctx.params.identifier))}`);
    },
    async mirroredHandleRss(ctx) {
      const identifier = encodeURIComponent(String(ctx.params.identifier));
      const domain = encodeURIComponent(String(ctx.params.domain));
      return this.renderFeed(ctx, 'rss', `/@${identifier}@${domain}`);
    },
    async mirroredHandleAtom(ctx) {
      const identifier = encodeURIComponent(String(ctx.params.identifier));
      const domain = encodeURIComponent(String(ctx.params.domain));
      return this.renderFeed(ctx, 'atom', `/@${identifier}@${domain}`);
    }
  },

  methods: {
    async fetchApDocument(basePath) {
      const targetUrl = `${buildBaseOrigin()}${basePath}`;
      try {
        const response = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            Accept: AP_ACCEPT
          }
        });

        if (!response.ok) {
          return { payload: null, targetUrl };
        }

        const payload = await response.json().catch(() => null);
        return { payload, targetUrl };
      } catch (_error) {
        return { payload: null, targetUrl };
      }
    },

    async renderFeed(ctx, format, basePath) {
      const { payload, targetUrl } = await this.fetchApDocument(basePath);
      const entries = toEntries(payload, targetUrl);
      const xml = format === 'rss' ? toRss(targetUrl, entries) : toAtom(targetUrl, entries);

      ctx.meta.$responseType = format === 'rss' ? 'application/rss+xml; charset=utf-8' : 'application/atom+xml; charset=utf-8';
      ctx.meta.$responseHeaders = {
        'cache-control': 'public, max-age=120'
      };

      return xml;
    }
  }
};
