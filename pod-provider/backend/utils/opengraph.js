'use strict';

/**
 * OpenGraph metadata fetcher for AP-side link previews.
 *
 * Fetches up to MAX_READ_CHARS of the target page's HTML and extracts:
 *   og:title, og:description, og:image, og:url,
 *   twitter:title, twitter:description, twitter:image,
 *   <title>, meta[name=description].
 *
 * Uses `node-fetch` v2 (CommonJS, already a pod-provider dependency).
 * Returns null on any error (network failure, timeout, non-HTML response, etc.).
 */

const fetch = require('node-fetch');

const USER_AGENT = 'ActivityPods/1.0 (+https://activitypods.org; +bot)';
const TIMEOUT_MS = 4_000;
const MAX_READ_CHARS = 50_000; // 50 KB — plenty to capture <head> OG tags

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch OpenGraph metadata for the given URL.
 *
 * @param {string} url
 * @returns {Promise<{ uri: string, title: string, description?: string, thumbUrl?: string } | null>}
 */
const fetchOpenGraph = async url => {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  try {
    const response = await fetch(url, {
      method: 'GET',
      timeout: TIMEOUT_MS,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5'
      }
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
      return null;
    }

    const text = await response.text();
    return parseOpenGraph(url, text.slice(0, MAX_READ_CHARS));
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// HTML parsing (no external dependency — regex-based, same as AT-side util)
// ---------------------------------------------------------------------------

const parseOpenGraph = (originalUri, html) => {
  const og = extractMetaTags(html);

  const title = og['og:title'] ?? og['twitter:title'] ?? extractPageTitle(html);
  if (!title) return null;

  return {
    uri: og['og:url'] ?? originalUri,
    title: title.trim().slice(0, 300),
    description:
      (og['og:description'] ?? og['twitter:description'] ?? og['description'])?.trim().slice(0, 1_000) || undefined,
    thumbUrl: og['og:image'] ?? og['twitter:image'] ?? undefined
  };
};

const extractMetaTags = html => {
  const tags = {};
  for (const metaMatch of html.matchAll(/<meta\b([^>]*?)>/gi)) {
    const attrs = metaMatch[1] ?? '';
    const keyMatch = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const valueMatch = /content\s*=\s*["']([^"']*)["']/i.exec(attrs);
    if (keyMatch && valueMatch) {
      const key = keyMatch[1].toLowerCase();
      if (key && !tags[key]) {
        tags[key] = unescapeHtml(valueMatch[1]);
      }
    }
  }
  return tags;
};

const extractPageTitle = html => {
  const m = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? unescapeHtml(m[1]?.trim() ?? '') : undefined;
};

const unescapeHtml = val =>
  val
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));

module.exports = { fetchOpenGraph };
