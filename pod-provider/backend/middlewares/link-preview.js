'use strict';

/**
 * LinkPreviewMiddleware
 *
 * Enriches outbound Note activities with a FEP-8967 attached-link signal.
 *
 * Flow:
 *   activitypub.outbox.post → Create/Update with Note object
 *     → prefer an explicit attached Link href when present
 *     → otherwise extract first external URL from note text / source
 *     → fetch OpenGraph metadata (4 s timeout)
 *     → attach or enrich as ActivityStreams Link with href and optional preview
 *
 * Runs on outbox only — inbound (inbox.post) is left unchanged to avoid
 * fetching OG for every remote post and to prevent SSRF amplification.
 *
 * If OG fetch fails or the Note already has publisher-provided preview claims,
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
  const explicitAttachmentUrl = findExplicitPreviewAttachmentUrl(noteObject);
  if (explicitAttachmentUrl) return explicitAttachmentUrl;

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
const asRecord = value => (value && typeof value === 'object' && !Array.isArray(value) ? value : null);

const sanitizeHttpUrl = value => {
  if (!value || typeof value !== 'string') return null;

  try {
    const parsed = new URL(value);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

const isLinkPreviewAttachment = attachment => {
  const record = asRecord(attachment);
  if (!record) return false;

  const type = typeof record.type === 'string' ? record.type.trim() : '';
  const mediaType = typeof record.mediaType === 'string' ? record.mediaType.trim().toLowerCase() : '';
  const href = sanitizeHttpUrl(
    typeof record.href === 'string'
      ? record.href
      : typeof record.url === 'string'
        ? record.url
        : null
  );

  if (!href) return false;
  if (type === 'Image' || type === 'Video' || type === 'Audio') return false;
  if (mediaType.startsWith('image/') || mediaType.startsWith('video/') || mediaType.startsWith('audio/')) {
    return false;
  }

  return type === 'Link'
    || (!type && typeof record.href === 'string')
    || (type === 'Document' && (!mediaType || mediaType === 'text/html'));
};

const findExistingLinkAttachmentIndex = (noteObject, href) => {
  const targetHref = sanitizeHttpUrl(href);
  if (!targetHref) return -1;

  return toArray(noteObject?.attachment).findIndex(attachment => {
    if (!isLinkPreviewAttachment(attachment)) return false;
    const record = asRecord(attachment);
    const candidateHref = sanitizeHttpUrl(
      typeof record?.href === 'string'
        ? record.href
        : typeof record?.url === 'string'
          ? record.url
          : null
    );
    return candidateHref === targetHref;
  });
};

const findExplicitPreviewAttachmentUrl = noteObject => {
  for (const attachment of toArray(noteObject?.attachment)) {
    if (!isLinkPreviewAttachment(attachment)) continue;
    const record = asRecord(attachment);
    const href = sanitizeHttpUrl(
      typeof record?.href === 'string'
        ? record.href
        : typeof record?.url === 'string'
          ? record.url
          : null
    );
    if (href) return href;
  }
  return null;
};

const hasExplicitPreviewClaims = noteObject =>
  toArray(noteObject?.attachment).some(attachment => {
    if (!isLinkPreviewAttachment(attachment)) return false;
    const record = asRecord(attachment);
    return !!(record?.preview || record?.name || record?.summary || record?.icon);
  });

/**
 * Build an ActivityStreams Link attachment from OpenGraph data.
 *
 * @param {{
 *   uri: string,
 *   title: string,
 *   description?: string,
 *   thumbUrl?: string,
 *   authorName?: string,
 *   authorUrl?: string,
 *   authors?: unknown[]
 * }} ogData
 * @returns {object}
 */
const buildLinkPreviewAttachment = ogData => {
  const preview = {
    type: 'Article',
    name: ogData.title
  };
  if (ogData.description) {
    preview.summary = ogData.description;
  }
  if (ogData.thumbUrl) {
    preview.image = {
      type: 'Image',
      url: ogData.thumbUrl
    };
  }

  const previewAuthors = Array.isArray(ogData.authors) && ogData.authors.length > 0
    ? ogData.authors
      .map(author => {
        const name = typeof author?.name === 'string' ? author.name.trim() : '';
        if (!name) return null;

        const entry = {
          type: 'Person',
          name
        };
        if (typeof author?.url === 'string' && author.url.trim()) {
          entry.url = author.url.trim();
        }
        if (typeof author?.account?.avatarUrl === 'string' && author.account.avatarUrl.trim()) {
          entry.icon = {
            type: 'Image',
            url: author.account.avatarUrl.trim()
          };
        }
        return entry;
      })
      .filter(Boolean)
    : [];
  if (previewAuthors.length > 0) {
    preview.attributedTo = previewAuthors.length === 1 ? previewAuthors[0] : previewAuthors;
  } else if (typeof ogData.authorName === 'string' && ogData.authorName.trim()) {
    preview.attributedTo = {
      type: 'Person',
      name: ogData.authorName.trim(),
      ...(typeof ogData.authorUrl === 'string' && ogData.authorUrl.trim()
        ? { url: ogData.authorUrl.trim() }
        : {})
    };
  }

  const attachment = {
    type: 'Link',
    mediaType: 'text/html',
    href: ogData.uri,
    name: ogData.title,
    preview
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
  if (typeof ogData.authorName === 'string' && ogData.authorName.trim()) {
    attachment.authorName = ogData.authorName.trim();
  }
  if (typeof ogData.authorUrl === 'string' && ogData.authorUrl.trim()) {
    attachment.authorUrl = ogData.authorUrl.trim();
  }
  if (Array.isArray(ogData.authors) && ogData.authors.length > 0) {
    attachment.authors = ogData.authors;
  }
  return attachment;
};

/**
 * Enrich a Note object with a link-preview attachment.
 * If the note already carries the same Link href, preserve publisher-provided
 * claims and only fill in missing preview data.
 *
 * @param {object} noteObject
 * @param {{
 *   uri: string,
 *   title: string,
 *   description?: string,
 *   thumbUrl?: string,
 *   authorName?: string,
 *   authorUrl?: string,
 *   authors?: unknown[]
 * }} ogData
 * @returns {object}
 */
const enrichNoteWithLinkPreview = (noteObject, ogData) => {
  const existing = toArray(noteObject.attachment);
  const previewAttachment = buildLinkPreviewAttachment(ogData);
  const existingIndex = findExistingLinkAttachmentIndex(noteObject, ogData.uri);
  if (existingIndex >= 0) {
    const current = asRecord(existing[existingIndex]);
    if (current?.preview || current?.name || current?.summary || current?.icon) {
      return noteObject;
    }

    const merged = existing.map((attachment, index) => (index === existingIndex
      ? { ...previewAttachment, ...current, href: previewAttachment.href }
      : attachment));
    return {
      ...noteObject,
      attachment: merged.length === 1 ? merged[0] : merged
    };
  }

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
  if (hasExplicitPreviewClaims(note)) return activity;

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
