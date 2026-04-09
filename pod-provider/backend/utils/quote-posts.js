'use strict';

/**
 * FEP-dd4b: Quote Posts — AP-side normalization utilities.
 *
 * An Announce activity becomes a quote post when it carries a `content`
 * property (and optionally `attachment`, `tag`, `inReplyTo`).
 *
 * Spec key rules:
 *  - `object` MUST be a reference to the shared content (URI or inline object)
 *  - `content` MAY hold additional commentary
 *  - `attachment` MAY hold additional media
 *  - `tag` MAY hold Mention/Hashtag metadata
 *  - `inReplyTo` MAY connect the quote to another conversation
 *  - Announce SHOULD always appear in the shared object's `shares` collection
 */

const sanitizeHtml = require('sanitize-html');

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const isObject = v => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const asArray = v => (Array.isArray(v) ? v : v == null ? [] : [v]);

const firstIri = value => {
  if (typeof value === 'string' && value.startsWith('http')) return value;
  if (isObject(value)) {
    const id = value.id || value['@id'];
    if (typeof id === 'string' && id.startsWith('http')) return id;
  }
  return null;
};

const isAnnounce = activity =>
  activity && (activity.type === 'Announce' || activity['@type'] === 'Announce');

/**
 * Returns true when the activity has a non-empty `content` string — the
 * distinguishing signal for a quote post vs a plain boost/reshare.
 */
const hasCommentary = activity => {
  const content = activity.content;
  if (typeof content !== 'string') return false;
  return content.trim().length > 0;
};

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/**
 * Sanitize the commentary content: allow basic inline HTML (<a>, <br>,
 * <strong>, <em>, <code>, <span>) but strip scripts, iframes, etc.
 *
 * @param {string} raw
 * @returns {string}
 */
const sanitizeContent = raw =>
  sanitizeHtml(raw, {
    allowedTags: ['a', 'br', 'strong', 'em', 'b', 'i', 'code', 'span', 'p'],
    allowedAttributes: { a: ['href', 'rel', 'class'], span: ['class'], '*': [] },
    allowedSchemes: ['http', 'https'],
  }).trim();

/**
 * Normalize a single tag entry (Mention or Hashtag).
 *   - type MUST be 'Mention' or 'Hashtag'
 *   - href MUST be a valid http URI
 *   - name SHOULD be present (plain text)
 *
 * Returns null if the entry cannot be normalized.
 *
 * @param {unknown} tag
 * @returns {object|null}
 */
const normalizeTag = tag => {
  if (!isObject(tag)) return null;

  const type = tag.type || tag['@type'];
  if (type !== 'Mention' && type !== 'Hashtag') return null;

  const href = typeof tag.href === 'string' && tag.href.startsWith('http') ? tag.href : null;
  if (!href) return null;

  const result = { type, href };

  const name = typeof tag.name === 'string' ? tag.name.trim() : null;
  if (name) result.name = name;

  return result;
};

/**
 * Normalize the `tag` property of a quote post activity.
 * Returns undefined when there are no valid tags.
 *
 * @param {unknown} tagValue
 * @returns {object|object[]|undefined}
 */
const normalizeTags = tagValue => {
  if (tagValue == null) return undefined;
  const entries = asArray(tagValue).map(normalizeTag).filter(Boolean);
  if (entries.length === 0) return undefined;
  return entries.length === 1 ? entries[0] : entries;
};

/**
 * Normalize the `inReplyTo` property.
 * Accepts a URI string or an object with id/href.
 * Returns a plain URI string or undefined.
 *
 * @param {unknown} value
 * @returns {string|undefined}
 */
const normalizeInReplyTo = value => {
  if (typeof value === 'string' && value.startsWith('http')) return value;
  if (isObject(value)) {
    const iri = firstIri(value);
    if (iri) return iri;
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true when the activity is a quote post (Announce with commentary).
 *
 * @param {unknown} activity
 * @returns {boolean}
 */
const isQuotePost = activity => isObject(activity) && isAnnounce(activity) && hasCommentary(activity);

/**
 * Validate that the Announce has a resolvable `object` reference.
 * Returns the object IRI on success, or null.
 *
 * @param {unknown} activity
 * @returns {string|null}
 */
const getQuoteObjectIri = activity => {
  if (!isObject(activity)) return null;
  return firstIri(activity.object);
};

/**
 * Normalize an Announce activity that carries commentary (quote post).
 *
 * Rules applied:
 *  1. `object` must be present and kept as-is (spec: MUST)
 *  2. `content` is sanitized (inline HTML allowed; scripts removed)
 *  3. `attachment` is passed through unchanged (FEP-1311 middleware handles it)
 *  4. `tag` entries are validated: only Mention/Hashtag with valid href kept
 *  5. `inReplyTo` is normalized to a plain URI string
 *  6. Unrecognised extra properties are preserved (open-world assumption)
 *
 * Returns a new object only when something actually changed; otherwise
 * returns the same reference (identity check safe).
 *
 * @param {object} activity - Announce activity
 * @returns {object}
 */
const normalizeQuotePost = activity => {
  if (!isObject(activity) || !isAnnounce(activity)) return activity;
  if (!hasCommentary(activity)) return activity;

  // object reference is required per spec
  if (!firstIri(activity.object)) return activity;

  let changed = false;
  const result = { ...activity };

  // 1 — sanitize content
  const cleanContent = sanitizeContent(activity.content);
  if (cleanContent !== activity.content) {
    result.content = cleanContent;
    changed = true;
  }

  // 2 — normalize tags
  const normalizedTags = normalizeTags(activity.tag);
  if (normalizedTags === undefined && activity.tag != null) {
    delete result.tag;
    changed = true;
  } else if (normalizedTags !== undefined && normalizedTags !== activity.tag) {
    result.tag = normalizedTags;
    changed = true;
  }

  // 3 — normalize inReplyTo
  const normalizedInReplyTo = normalizeInReplyTo(activity.inReplyTo);
  if (normalizedInReplyTo === undefined && activity.inReplyTo != null) {
    delete result.inReplyTo;
    changed = true;
  } else if (normalizedInReplyTo !== undefined && normalizedInReplyTo !== activity.inReplyTo) {
    result.inReplyTo = normalizedInReplyTo;
    changed = true;
  }

  return changed ? result : activity;
};

module.exports = {
  isQuotePost,
  getQuoteObjectIri,
  normalizeQuotePost,
  // exported for testing only
  sanitizeContent,
  normalizeTag,
  normalizeInReplyTo,
};
