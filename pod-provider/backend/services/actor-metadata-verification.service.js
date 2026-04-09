'use strict';

const fetch = require('node-fetch');
const { Errors } = require('moleculer');
const { retryWithBackoff, CircuitBreaker, CircuitOpenError } = require('../utils/backoff');
const { assertSafeTarget } = require('../utils/oauth-http');

const { MoleculerError } = Errors;

const REL_ME_CACHE_TTL_MS = Number(process.env.REL_ME_CACHE_TTL_MS || 10 * 60 * 1000);
const REL_ME_FETCH_TIMEOUT_MS = Number(process.env.REL_ME_FETCH_TIMEOUT_MS || 4000);
const REL_ME_FETCH_MAX_BYTES = Number(process.env.REL_ME_FETCH_MAX_BYTES || 1024 * 1024);

const REL_TOKENS_ME = new Set(['me']);

const toArray = value => (Array.isArray(value) ? value : value != null ? [value] : []);

const normalizeAbsUrl = value => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
};

const normalizeUrlAgainstBase = (base, href) => {
  if (typeof href !== 'string' || !href.trim()) return null;
  try {
    const parsed = new URL(href, base);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
};

const splitRel = rel =>
  toArray(rel)
    .flatMap(value => (typeof value === 'string' ? value.split(/\s+/) : []))
    .map(v => v.trim().toLowerCase())
    .filter(Boolean);

const hasRelMe = rel => splitRel(rel).some(token => REL_TOKENS_ME.has(token));

const parseAttributes = raw => {
  const attrs = Object.create(null);
  if (typeof raw !== 'string' || raw.length === 0) return attrs;

  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match;
  while ((match = re.exec(raw)) !== null) {
    const key = String(match[1] || '').toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = value;
  }
  return attrs;
};

const extractRelMeLinks = (html, baseUrl) => {
  if (typeof html !== 'string' || html.length === 0) return [];

  const results = [];

  const anchorRe = /<a\b([^>]*)>/gi;
  let match;
  while ((match = anchorRe.exec(html)) !== null) {
    const attrs = parseAttributes(match[1]);
    if (!hasRelMe(attrs.rel)) continue;
    const href = normalizeUrlAgainstBase(baseUrl, attrs.href);
    if (href) results.push(href);
  }

  const linkRe = /<link\b([^>]*)>/gi;
  while ((match = linkRe.exec(html)) !== null) {
    const attrs = parseAttributes(match[1]);
    if (!hasRelMe(attrs.rel)) continue;
    const href = normalizeUrlAgainstBase(baseUrl, attrs.href);
    if (href) results.push(href);
  }

  return [...new Set(results)];
};

const canonicalVariants = urlString => {
  const normalized = normalizeAbsUrl(urlString);
  if (!normalized) return new Set();

  const variants = new Set([normalized]);
  try {
    const parsed = new URL(normalized);
    if (parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
      variants.add(parsed.href);
    } else {
      const withSlash = new URL(parsed.href);
      withSlash.pathname = `${withSlash.pathname}/`;
      variants.add(withSlash.href);
    }
  } catch {
    // no-op
  }
  return variants;
};

const isRetryableHttpStatus = status => status === 429 || status >= 500;

module.exports = {
  name: 'actor-metadata-verification',

  created() {
    this._relMeCache = new Map();
    this._breakersByHost = new Map();
  },

  actions: {
    verifyRelMeLink: {
      params: {
        actorUri: { type: 'string' },
        href: { type: 'string' }
      },
      async handler(ctx) {
        const actorUri = normalizeAbsUrl(ctx.params.actorUri);
        const href = normalizeAbsUrl(ctx.params.href);

        if (!actorUri) {
          throw new MoleculerError('actorUri must be an absolute http(s) URL', 400, 'INVALID_ACTOR_URI');
        }
        if (!href) {
          throw new MoleculerError('href must be an absolute http(s) URL', 400, 'INVALID_REL_ME_HREF');
        }

        const cacheKey = `${actorUri}|${href}`;
        const now = Date.now();
        const cached = this._relMeCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
          return { ...cached.payload, cacheHit: true };
        }

        const url = new URL(href);
        const breaker = this.getBreakerForHost(url.hostname);

        try {
          const payload = await breaker.execute(() =>
            retryWithBackoff(
              () => this.verifyRelMeWithFetch({ actorUri, href }),
              {
                maxRetries: 2,
                baseDelayMs: 120,
                maxDelayMs: 900,
                deadlineMs: 3000,
                retryIf: err => Boolean(err && (err.retryable === true || err.code === 'ECONNRESET'))
              }
            )
          );

          this._relMeCache.set(cacheKey, {
            expiresAt: now + REL_ME_CACHE_TTL_MS,
            payload
          });

          return { ...payload, cacheHit: false };
        } catch (error) {
          if (error instanceof CircuitOpenError) {
            return {
              actorUri,
              href,
              verified: false,
              reason: 'dependency_temporarily_unavailable',
              cacheHit: false,
              checkedAt: new Date().toISOString()
            };
          }

          // Failure isolation: verification must never block federation flows.
          return {
            actorUri,
            href,
            verified: false,
            reason: 'verification_failed',
            cacheHit: false,
            checkedAt: new Date().toISOString()
          };
        }
      }
    },

    verifyActorMetadata: {
      params: {
        actorUri: { type: 'string' },
        actor: { type: 'object', optional: true }
      },
      async handler(ctx) {
        const actorUri = normalizeAbsUrl(ctx.params.actorUri);
        if (!actorUri) {
          throw new MoleculerError('actorUri must be an absolute http(s) URL', 400, 'INVALID_ACTOR_URI');
        }

        const actor = ctx.params.actor || (await ctx.call('activitypub.actor.get', { actorUri }).catch(() => null));
        if (!actor || typeof actor !== 'object') {
          return {
            actorUri,
            checkedAt: new Date().toISOString(),
            links: [],
            summary: { totalRelMeLinks: 0, verifiedCount: 0 }
          };
        }

        const attachments = Array.isArray(actor.attachment)
          ? actor.attachment
          : actor.attachment != null
            ? [actor.attachment]
            : [];

        const relMeLinks = attachments
          .filter(item => item && typeof item === 'object')
          .filter(item => {
            const types = toArray(item.type || item['@type']);
            return types.includes('Link') && hasRelMe(item.rel);
          })
          .map(item => item.href || item.url)
          .map(hrefValue => normalizeAbsUrl(hrefValue))
          .filter(Boolean);

        const uniqueLinks = [...new Set(relMeLinks)];
        const results = [];

        for (const href of uniqueLinks) {
          const result = await ctx.call('actor-metadata-verification.verifyRelMeLink', {
            actorUri,
            href
          });
          results.push(result);
        }

        return {
          actorUri,
          checkedAt: new Date().toISOString(),
          links: results,
          summary: {
            totalRelMeLinks: uniqueLinks.length,
            verifiedCount: results.filter(item => item.verified).length
          }
        };
      }
    }
  },

  methods: {
    getBreakerForHost(hostname) {
      const key = String(hostname || '').toLowerCase();
      if (!this._breakersByHost.has(key)) {
        this._breakersByHost.set(
          key,
          new CircuitBreaker({
            name: `rel-me:${key}`,
            failureThreshold: 4,
            resetTimeoutMs: 20_000
          })
        );
      }
      return this._breakersByHost.get(key);
    },

    async verifyRelMeWithFetch({ actorUri, href }) {
      await assertSafeTarget(href, false);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REL_ME_FETCH_TIMEOUT_MS);

      try {
        const response = await fetch(href, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
            'User-Agent': 'ActivityPodsRelMeVerifier/1.0'
          }
        });

        if (!response.ok) {
          const error = new Error(`rel-me source returned HTTP ${response.status}`);
          error.retryable = isRetryableHttpStatus(response.status);
          throw error;
        }

        const contentType = String(response.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
          return {
            actorUri,
            href,
            verified: false,
            reason: 'unsupported_content_type',
            checkedAt: new Date().toISOString()
          };
        }

        const declaredLength = Number(response.headers.get('content-length') || 0);
        if (Number.isFinite(declaredLength) && declaredLength > REL_ME_FETCH_MAX_BYTES) {
          return {
            actorUri,
            href,
            verified: false,
            reason: 'document_too_large',
            checkedAt: new Date().toISOString()
          };
        }

        const html = await this.readResponseTextWithLimit(response, REL_ME_FETCH_MAX_BYTES);
        const discovered = extractRelMeLinks(html, href);

        const actorVariants = canonicalVariants(actorUri);
        const matched = discovered.some(link => actorVariants.has(link));

        return {
          actorUri,
          href,
          verified: matched,
          reason: matched ? 'verified' : 'no_reciprocal_rel_me_link',
          checkedAt: new Date().toISOString()
        };
      } catch (error) {
        if (error && typeof error.message === 'string') {
          const lower = error.message.toLowerCase();
          if (lower.includes('abort') || lower.includes('timeout') || lower.includes('network')) {
            error.retryable = true;
          }
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },

    async readResponseTextWithLimit(response, maxBytes) {
      const chunks = [];
      let total = 0;

      for await (const chunk of response.body) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > maxBytes) {
          throw new Error('response body exceeds configured maximum size');
        }
        chunks.push(buffer);
      }

      return Buffer.concat(chunks).toString('utf8');
    }
  }
};
