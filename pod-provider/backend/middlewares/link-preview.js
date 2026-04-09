'use strict';

/**
 * LinkPreviewMiddleware
 *
 * Enriches outbound Note activities with an OpenGraph link-preview attachment.
 *
 * Flow:
 *   activitypub.outbox.post → Create/Update with Note object
 *     → extract first external URL from note text / source
 *     → fetch OpenGraph metadata (4 s timeout)
 *     → attach as ActivityStreams Link with name/summary/icon
 *
 * Runs on outbox only — inbound (inbox.post) is left unchanged to avoid
 * fetching OG for every remote post and to prevent SSRF amplification.
 *
 * If OG fetch fails or the Note already has a Link attachment for that URL,
 * the object is returned unmodified.
 */

const { hasType } = require('@semapps/ldp');
const { fetchOpenGraph } = require('../utils/opengraph');

// ---------------------------------------------------------------------------
// URL extraction helpers
// ---------------------------------------------------------------------------

/** Regex that matches raw http/https URLs in plain text. */
const RAW_URL_RE = /https?:\/\/[^\s"'<>)\]]+/g;

/**
 * Paths that indicate a hashtag, mention, or internal federation URI —
 * we skip these when looking for link-preview candidates.
 */
const SKIP_PATH_RE = /\/tags\/|\/users\/|\/@|\/actor\/|\/profile\//;

const isValidHttpUrl = url => {
  try {
    const p = new URL(url);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Extract the first external URL that is a suitable link-preview candidate.
 * Prefers `source.content` (raw text) for accuracy; falls back to scanning
 * anchor hrefs in the rendered `content` HTML.
 *
 * @param {object} noteObject - ActivityStreams Note
 * @returns {string | null}
 */
const extractFirstPreviewUrl = noteObject => {
  // 1. Source content (plain text / Markdown) — most reliable
  const src = noteObject.source;
  if (src && typeof src.content === 'string') {
    const mt = src.mediaType || '';
    if (!mt || mt === 'text/plain' || mt.includes('markdown')) {
      const matches = [...src.content.matchAll(RAW_URL_RE)].map(m => m[0]);
      const url = matches.find(u => !SKIP_PATH_RE.test(u) && isValidHttpUrl(u));
      if (url) return cleanUrlTrailingPunct(url);
    }
  }

  // 2. Rendered HTML — extract from <a href="..."> anchors
  if (typeof noteObject.content === 'string') {
    const hrefRe = /href="(https?:\/\/[^"]+)"/gi;
    let m;
    while ((m = hrefRe.exec(noteObject.content)) !== null) {
      const u = m[1];
      if (!SKIP_PATH_RE.test(u) && isValidHttpUrl(u)) return u;
    }
  }

  return null;
};

/** Strip common trailing punctuation that accidentally gets captured by the URL regex. */
const cleanUrlTrailingPunct = url => url.replace(/[.,;:!?)\]]+$/, '');

// ---------------------------------------------------------------------------
// AP object enrichment
// ---------------------------------------------------------------------------

const toArray = v => (Array.isArray(v) ? v : v ? [v] : []);

/**
 * Build an ActivityStreams Link attachment from OpenGraph data.
 *
 * @param {{ uri: string, title: string, description?: string, thumbUrl?: string }} ogData
 * @returns {object}
 */
const buildLinkPreviewAttachment = ogData => {
  const attachment = {
    type: 'Link',
    mediaType: 'text/html',
    href: ogData.uri,
    name: ogData.title
  };
  if (ogData.description) {
    attachment.summary = ogData.description;
  }
  if (ogData.thumbUrl) {
    attachment.icon = {
      type: 'Image',
      url: ogData.thumbUrl
    };
  }
  return attachment;
};

/**
 * Enrich a Note object with a link-preview attachment.
 * No-ops if the note already has a Link attachment for the same href.
 *
 * @param {object} noteObject
 * @param {{ uri: string, title: string, description?: string, thumbUrl?: string }} ogData
 * @returns {object}
 */
const enrichNoteWithLinkPreview = (noteObject, ogData) => {
  const existing = toArray(noteObject.attachment);
  const alreadyPresent = existing.some(a => a && a.type === 'Link' && a.href === ogData.uri);
  if (alreadyPresent) return noteObject;

  const previewAttachment = buildLinkPreviewAttachment(ogData);
  const merged = [...existing, previewAttachment];

  return {
    ...noteObject,
    attachment: merged.length === 1 ? merged[0] : merged
  };
};

// ---------------------------------------------------------------------------
// Activity-level enrichment
// ---------------------------------------------------------------------------

const shouldEnrich = activity =>
  activity &&
  typeof activity === 'object' &&
  (hasType(activity, 'Create') || hasType(activity, 'Update')) &&
  activity.object &&
  typeof activity.object === 'object' &&
  hasType(activity.object, 'Note');

const enrichActivity = async activity => {
  if (!shouldEnrich(activity)) return activity;

  const note = activity.object;
  const url = extractFirstPreviewUrl(note);
  if (!url) return activity;

  const ogData = await fetchOpenGraph(url);
  if (!ogData) return activity;

  return {
    ...activity,
    object: enrichNoteWithLinkPreview(note, ogData)
  };
};

// ---------------------------------------------------------------------------
// Moleculer middleware
// ---------------------------------------------------------------------------

const LinkPreviewMiddleware = () => ({
  name: 'LinkPreviewMiddleware',
  localAction: (next, action) => {
    // Only intercept outbound: inbox posts are foreign content, not ours to enrich.
    if (action.name !== 'activitypub.outbox.post') {
      return next;
    }

    return async ctx => {
      if (!ctx.params || typeof ctx.params !== 'object') {
        return next(ctx);
      }

      const { collectionUri, ...activity } = ctx.params;
      const enriched = await enrichActivity(activity);

      ctx.params = collectionUri ? { collectionUri, ...enriched } : enriched;
      return next(ctx);
    };
  }
});

module.exports = LinkPreviewMiddleware;
module.exports.extractFirstPreviewUrl = extractFirstPreviewUrl;
module.exports.enrichNoteWithLinkPreview = enrichNoteWithLinkPreview;
module.exports.buildLinkPreviewAttachment = buildLinkPreviewAttachment;
