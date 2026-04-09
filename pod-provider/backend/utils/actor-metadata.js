'use strict';

/**
 * FEP-fb2a: Actor metadata normalization helpers.
 *
 * Canonical metadata entries are represented as:
 *   - { type: 'Note', name, content }
 *   - { type: 'Link', href, name?, rel? }
 *
 * Backward compatibility supported for legacy Mastodon-style profile fields:
 *   - type: PropertyValue / http://schema.org#PropertyValue / https://schema.org/PropertyValue
 *   - value: value / http://schema.org#value / https://schema.org/value
 */

const URL_RE = /^https?:\/\//i;
const REL_ME_TOKEN = 'me';

const ACTOR_TYPES = new Set([
  'Application',
  'Group',
  'Organization',
  'Person',
  'Service'
]);

const LEGACY_PROPERTY_VALUE_TYPES = new Set([
  'PropertyValue',
  'schema:PropertyValue',
  'http://schema.org#PropertyValue',
  'https://schema.org/PropertyValue'
]);

const LEGACY_VALUE_KEYS = ['value', 'http://schema.org#value', 'https://schema.org/value'];

const toArray = value => (Array.isArray(value) ? value : value != null ? [value] : []);

const normalizeString = value => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Strip C0/C1 control chars and nulls to reduce log/storage risks.
  // eslint-disable-next-line no-control-regex
  return trimmed.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
};

const normalizeName = value => {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  return normalized.slice(0, 256);
};

const normalizeContent = value => {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  return normalized.slice(0, 5000);
};

const normalizeHref = value => {
  const normalized = normalizeString(value);
  if (!normalized || !URL_RE.test(normalized)) return null;
  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.href;
  } catch {
    return null;
  }
};

const normalizeRel = value => {
  const rel = toArray(value)
    .map(v => normalizeString(v))
    .filter(Boolean)
    .map(v => v.toLowerCase())
    .slice(0, 16);
  if (rel.length === 0) return undefined;
  return [...new Set(rel)];
};

const hasRelMe = value => normalizeRel(value)?.includes(REL_ME_TOKEN) || false;

const normalizeComparableHref = value => {
  const href = normalizeHref(value);
  if (!href) return null;

  try {
    const parsed = new URL(href);
    if (parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    }
    parsed.hash = '';
    return parsed.href;
  } catch {
    return href;
  }
};

const hasType = (item, type) => toArray(item?.type || item?.['@type']).includes(type);

const hasActorType = object => {
  if (!object || typeof object !== 'object') return false;
  const types = toArray(object.type || object['@type']);
  return types.some(type => ACTOR_TYPES.has(type));
};

const isLegacyPropertyValue = item => {
  if (!item || typeof item !== 'object') return false;
  return [...LEGACY_PROPERTY_VALUE_TYPES].some(type => hasType(item, type));
};

const normalizeNoteMetadata = item => {
  if (!item || typeof item !== 'object') return null;
  if (!hasType(item, 'Note')) return null;

  const name = normalizeName(item.name);
  const content = normalizeContent(item.content);
  if (!name || !content) return null;

  return {
    type: 'Note',
    name,
    content
  };
};

const normalizeLinkMetadata = item => {
  if (!item || typeof item !== 'object') return null;
  if (!hasType(item, 'Link')) return null;

  const href = normalizeHref(item.href || item.url);
  if (!href) return null;

  const normalized = {
    type: 'Link',
    href
  };

  const name = normalizeName(item.name);
  if (name) normalized.name = name;

  const rel = normalizeRel(item.rel);
  if (rel) normalized.rel = rel;

  return normalized;
};

const hasRelMeLinkMetadata = actorObject => {
  if (!hasActorType(actorObject)) return false;
  return toArray(actorObject.attachment).some(item => hasType(item, 'Link') && hasRelMe(item.rel));
};

const normalizeLegacyPropertyValue = item => {
  if (!isLegacyPropertyValue(item)) return null;

  const name = normalizeName(item.name);
  if (!name) return null;

  let legacyValue = null;
  for (const key of LEGACY_VALUE_KEYS) {
    if (key in item) {
      legacyValue = normalizeContent(item[key]);
      if (legacyValue) break;
    }
  }

  if (!legacyValue) return null;

  return {
    type: 'Note',
    name,
    content: legacyValue
  };
};

/**
 * Normalize attachment entries that represent actor metadata according to
 * FEP-fb2a while keeping non-metadata attachments untouched.
 *
 * @param {object} actorObject
 * @returns {object}
 */
const normalizeActorMetadataAttachments = actorObject => {
  if (!hasActorType(actorObject)) return actorObject;
  const raw = actorObject.attachment;
  if (raw == null) return actorObject;

  const items = Array.isArray(raw) ? raw : [raw];
  const passOne = [];
  const leftovers = [];
  const seenNames = new Set();
  let anyChanged = false;

  for (const item of items) {
    const note = normalizeNoteMetadata(item);
    if (note) {
      passOne.push(note);
      seenNames.add(note.name.toLowerCase());
      if (note !== item) anyChanged = true;
      continue;
    }

    const link = normalizeLinkMetadata(item);
    if (link) {
      passOne.push(link);
      if (link.name) seenNames.add(link.name.toLowerCase());
      if (link !== item) anyChanged = true;
      continue;
    }

    leftovers.push(item);
  }

  for (const item of leftovers) {
    const legacy = normalizeLegacyPropertyValue(item);
    if (legacy) {
      const key = legacy.name.toLowerCase();
      if (!seenNames.has(key)) {
        passOne.push(legacy);
        seenNames.add(key);
        anyChanged = true;
      } else {
        anyChanged = true;
      }
      continue;
    }

    passOne.push(item);
  }

  const nextAttachment = passOne.length === 1 ? passOne[0] : passOne;

  const sameLength = passOne.length === items.length;
  const sameRefs = sameLength && passOne.every((item, i) => item === items[i]);
  if (!anyChanged && sameRefs) return actorObject;

  return {
    ...actorObject,
    attachment: nextAttachment
  };
};

const annotateActorMetadataVerification = (actorObject, verification) => {
  if (!hasActorType(actorObject)) return actorObject;

  const raw = actorObject.attachment;
  if (raw == null) return actorObject;

  const items = Array.isArray(raw) ? raw : [raw];
  const verificationLinks = Array.isArray(verification?.links) ? verification.links : [];
  if (verificationLinks.length === 0) return actorObject;

  const resultsByHref = new Map(
    verificationLinks
      .map(item => [normalizeComparableHref(item?.href), item])
      .filter(([href]) => Boolean(href))
  );

  let anyChanged = false;
  const nextItems = items.map(item => {
    if (!item || typeof item !== 'object') return item;
    if (!hasType(item, 'Link') || !hasRelMe(item.rel)) return item;

    const href = normalizeComparableHref(item.href || item.url);
    const result = href ? resultsByHref.get(href) : null;
    if (!result) return item;

    const verified = Boolean(result.verified);
    const verificationReason = normalizeName(result.reason);
    const verifiedAt = normalizeString(result.checkedAt);

    if (
      item.verified === verified &&
      item.verificationReason === verificationReason &&
      item.verifiedAt === verifiedAt
    ) {
      return item;
    }

    anyChanged = true;
    return {
      ...item,
      verified,
      ...(verificationReason ? { verificationReason } : {}),
      ...(verifiedAt ? { verifiedAt } : {})
    };
  });

  if (!anyChanged) return actorObject;

  return {
    ...actorObject,
    attachment: Array.isArray(raw) ? nextItems : nextItems[0]
  };
};

module.exports = {
  ACTOR_TYPES,
  LEGACY_PROPERTY_VALUE_TYPES,
  annotateActorMetadataVerification,
  hasRelMeLinkMetadata,
  normalizeActorMetadataAttachments,
  normalizeLegacyPropertyValue,
  normalizeLinkMetadata,
  normalizeNoteMetadata,
  hasActorType,
};
