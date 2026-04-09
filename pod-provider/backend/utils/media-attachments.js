'use strict';

/**
 * FEP-1311: Media Attachments normalization for AP-side objects.
 *
 * Normalizes attachment items on ActivityPub Notes and Articles to comply with
 * FEP-1311, which requires:
 *   - type MUST be "Image", "Video", or "Audio" (not "Document")
 *   - url MUST be present (not href)
 *   - name SHOULD be present (alt text / caption)
 *   - mediaType SHOULD be present
 *   - width, height (images/video), duration (audio/video) SHOULD be included when known
 *   - size (bytes), digestMultibase SHOULD be included when known
 *   - focalPoint, blurHash (Mastodon extensions) are preserved when present
 *   - Multiple media versions: url as array of Link objects is valid and preserved
 *
 * Non-media attachments (e.g. FEP-0ea0 payment Links, OG-preview Links from
 * LinkPreviewMiddleware) are passed through unchanged.
 */

const URL_RE = /^https?:\/\//i;

// MIME main type → ActivityStreams object type per FEP-1311
const MIME_MAIN_TO_AP_TYPE = Object.freeze({
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
});

// AP types that are valid FEP-1311 media attachment types
const MEDIA_AP_TYPES = new Set(['Image', 'Video', 'Audio']);

// AP types that MAY represent media if their MIME type indicates it
const CONVERTIBLE_AP_TYPES = new Set(['Document', 'Link']);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Infer MIME type from a URL's file extension (query-string stripped).
 * Returns undefined when not recognized.
 *
 * @param {string} url
 * @returns {string | undefined}
 */
const inferMimeFromUrl = url => {
  if (typeof url !== 'string') return undefined;
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.gif')) return 'image/gif';
  if (path.endsWith('.webp')) return 'image/webp';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.avif')) return 'image/avif';
  if (path.endsWith('.mp4')) return 'video/mp4';
  if (path.endsWith('.webm')) return 'video/webm';
  if (path.endsWith('.mov')) return 'video/quicktime';
  if (path.endsWith('.ogg')) return 'audio/ogg';
  if (path.endsWith('.mp3')) return 'audio/mpeg';
  if (path.endsWith('.flac')) return 'audio/flac';
  if (path.endsWith('.wav')) return 'audio/wav';
  if (path.endsWith('.m4a')) return 'audio/mp4';
  return undefined;
};

/**
 * Map a MIME type's main component to the corresponding AP object type.
 * Returns null if the MIME type is not audio/image/video.
 *
 * @param {string | undefined} mimeType
 * @returns {'Image' | 'Video' | 'Audio' | null}
 */
const inferApTypeFromMime = mimeType => {
  if (typeof mimeType !== 'string') return null;
  const main = mimeType.split('/')[0].toLowerCase();
  return MIME_MAIN_TO_AP_TYPE[main] ?? null;
};

/**
 * Resolve the single canonical media URL string from a (possibly old-style) item.
 * Returns null for multi-version url arrays (handled separately).
 *
 * @param {object} item
 * @returns {string | null}
 */
const resolveSingleUrl = item => {
  if (Array.isArray(item.url)) return null; // multi-version array — keep as-is
  if (typeof item.url === 'string' && URL_RE.test(item.url)) return item.url;
  if (typeof item.href === 'string' && URL_RE.test(item.href)) return item.href;
  return null;
};

/**
 * Copy the optional FEP-1311 SHOULD fields from source to target when present.
 *
 * @param {object} src
 * @param {object} dst
 */
const copyOptionalFields = (src, dst) => {
  const normalizedAlt = resolveAttachmentAltText(src);
  if (normalizedAlt != null) dst.name = normalizedAlt;
  if (src.width != null) dst.width = src.width;
  if (src.height != null) dst.height = src.height;
  if (src.duration != null) dst.duration = src.duration;
  if (src.size != null) dst.size = src.size;
  if (src.digestMultibase != null) dst.digestMultibase = src.digestMultibase;
  if (src.focalPoint != null) dst.focalPoint = src.focalPoint;
  if (src.blurHash != null) dst.blurHash = src.blurHash;
};

/**
 * Resolve a normalized alt text/caption from common AP/Mastodon aliases.
 * AP convention is `name`; Mastodon API commonly uses `description`.
 *
 * @param {object} src
 * @returns {string | null}
 */
const resolveAttachmentAltText = src => {
  const candidates = [
    src?.name,
    src?.description,
    src?.alt,
    src?.altText,
    src?.alt_text,
    src?.summary,
  ];

  for (const value of candidates) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim();
    if (normalized.length > 0) return normalized;
  }

  return null;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Normalize a single attachment item to FEP-1311 format.
 *
 * Rules:
 *   - Already-typed Image/Video/Audio items: migrate `href` → `url` if needed;
 *     multi-version `url` arrays are left untouched.
 *   - Document or Link items whose mediaType or URL extension indicates media:
 *     convert type to Image/Video/Audio and use `url` instead of `href`.
 *   - Bare http/https string URLs with a recognizable media extension:
 *     promoted to a typed object with `url` and `mediaType`.
 *   - All other items (non-media Links, payment links, etc.): returned unchanged.
 *   - Truly invalid inputs (null, non-string/object, no resolvable URL):
 *     returned as-is (caller decides whether to drop).
 *
 * @param {unknown} item
 * @returns {unknown} normalized item (same reference when nothing needs changing)
 */
const normalizeMediaAttachment = item => {
  // ── Bare string URL ───────────────────────────────────────────────────────
  if (typeof item === 'string') {
    if (!URL_RE.test(item)) return item;
    const mime = inferMimeFromUrl(item);
    const apType = inferApTypeFromMime(mime);
    if (!apType) return item; // not a recognizable media URL, leave as-is
    const normalized = { type: apType, url: item };
    if (mime) normalized.mediaType = mime;
    return normalized;
  }

  if (!item || typeof item !== 'object') return item;

  const existingType = item.type;

  // ── Already a FEP-1311 media type (Image / Video / Audio) ─────────────────
  if (MEDIA_AP_TYPES.has(existingType)) {
    // Multi-version url array is valid FEP-1311 — keep entirely as-is
    if (Array.isArray(item.url)) return item;

    const url = resolveSingleUrl(item);
    if (!url) return item; // no resolvable URL — pass through

    const mime = item.mediaType || inferMimeFromUrl(url);
    const needsUrlFix = !item.url && item.href; // only href present
    const needsMimeFix = !item.mediaType && mime;

    if (!needsUrlFix && !needsMimeFix) return item; // already conformant

    const normalized = { type: existingType, url };
    if (mime) normalized.mediaType = mime;
    copyOptionalFields(item, normalized);
    return normalized;
  }

  // ── Convertible types: Document, Link ─────────────────────────────────────
  if (CONVERTIBLE_AP_TYPES.has(existingType)) {
    // Try to determine AP media type from existing MIME first
    let apType = inferApTypeFromMime(item.mediaType);

    // Fall back to inferring from the URL extension
    if (!apType) {
      const url = resolveSingleUrl(item);
      if (!url) return item; // no URL, can't determine — pass through
      apType = inferApTypeFromMime(inferMimeFromUrl(url));
    }

    if (!apType) return item; // not a media attachment — pass through unchanged

    const url = resolveSingleUrl(item);
    if (!url) return item;

    const mime = item.mediaType || inferMimeFromUrl(url);
    const normalized = { type: apType, url };
    if (mime) normalized.mediaType = mime;
    copyOptionalFields(item, normalized);
    return normalized;
  }

  // ── Unknown / unrecognized type ────────────────────────────────────────────
  return item; // pass through unchanged
};

/**
 * Normalize all media attachments on an ActivityPub object (Note or Article)
 * to comply with FEP-1311.
 *
 * Non-media attachments are preserved in their original position.
 * Returns the same object reference when no attachment required changing.
 *
 * @param {object} apObject - ActivityPub object with optional `attachment` field
 * @returns {object}
 */
const normalizeObjectMediaAttachments = apObject => {
  if (!apObject || typeof apObject !== 'object') return apObject;

  const raw = apObject.attachment;
  if (raw == null) return apObject;

  const items = Array.isArray(raw) ? raw : [raw];
  let anyChanged = false;

  const normalized = items.map(item => {
    const result = normalizeMediaAttachment(item);
    if (result !== item) anyChanged = true;
    return result;
  });

  if (!anyChanged) return apObject;

  return {
    ...apObject,
    attachment: normalized.length === 1 ? normalized[0] : normalized,
  };
};

module.exports = {
  inferMimeFromUrl,
  inferApTypeFromMime,
  normalizeMediaAttachment,
  normalizeObjectMediaAttachments,
};
