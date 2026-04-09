'use strict';

const sanitizeHtml = require('sanitize-html');

const NORMALIZABLE_TYPES = new Set(['Note', 'Article', 'Page']);
const TRUE_RE = /^(1|true|yes)$/i;

const toArray = value => (Array.isArray(value) ? value : value ? [value] : []);

const hasType = (value, type) => toArray(value).includes(type);

const supportsContentWarning = object => {
  if (!object || typeof object !== 'object') return false;
  return [...NORMALIZABLE_TYPES].some(type => hasType(object.type || object['@type'], type));
};

const sanitizeWarningText = value => {
  if (typeof value !== 'string') return undefined;

  // CW / spoiler text should be plain text for broad compatibility.
  const plain = sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();

  if (!plain) return undefined;
  return plain.length > 500 ? `${plain.slice(0, 497)}...` : plain;
};

const readExplicitWarningAlias = object => {
  const candidates = [
    object.spoiler_text,
    object.spoilerText,
    object.contentWarning,
    object.content_warning,
    object.cw,
  ];

  for (const value of candidates) {
    const normalized = sanitizeWarningText(value);
    if (normalized) return normalized;
  }

  return undefined;
};

const readSummaryWarning = object => sanitizeWarningText(object.summary);

const readExplicitSensitive = object => {
  if (typeof object.sensitive === 'boolean') return object.sensitive;
  if (typeof object.nsfw === 'boolean') return object.nsfw;
  return undefined;
};

const deriveCanonicalWarningAndSensitive = object => {
  const aliasWarning = readExplicitWarningAlias(object);
  const summaryWarning = readSummaryWarning(object);
  const explicitSensitive = readExplicitSensitive(object);

  // Alias fields represent explicit user intent for CW and should win over summary.
  const summary = aliasWarning ?? summaryWarning;

  // We only infer sensitive=true from explicit CW aliases, not from summary alone,
  // because Article/Page summary can be a plain abstract.
  let sensitive = explicitSensitive;
  if (typeof sensitive !== 'boolean' && aliasWarning) {
    sensitive = true;
  }

  return { summary, sensitive };
};

const stripAliasFields = object => {
  const next = { ...object };
  delete next.spoiler_text;
  delete next.spoilerText;
  delete next.contentWarning;
  delete next.content_warning;
  delete next.cw;
  delete next.nsfw;
  return next;
};

const normalizeObjectContentWarning = object => {
  if (!supportsContentWarning(object)) return object;

  const { summary, sensitive } = deriveCanonicalWarningAndSensitive(object);

  // No canonicalization needed and no aliases present.
  if (
    summary === object.summary &&
    (typeof sensitive !== 'boolean' || sensitive === object.sensitive) &&
    object.spoiler_text == null &&
    object.spoilerText == null &&
    object.contentWarning == null &&
    object.content_warning == null &&
    object.cw == null &&
    object.nsfw == null
  ) {
    return object;
  }

  const next = stripAliasFields(object);

  if (summary) {
    next.summary = summary;
  } else if (typeof next.summary === 'string' && !sanitizeWarningText(next.summary)) {
    delete next.summary;
  }

  if (typeof sensitive === 'boolean') {
    next.sensitive = sensitive;
  }

  return next;
};

const normalizeActivityContentWarning = activity => {
  if (!activity || typeof activity !== 'object') return activity;

  const type = activity.type || activity['@type'];
  if (type === 'Create' || type === 'Update') {
    if (!activity.object || typeof activity.object !== 'object') return activity;

    const normalizedObject = normalizeObjectContentWarning(activity.object);
    if (normalizedObject === activity.object) return activity;
    return { ...activity, object: normalizedObject };
  }

  return normalizeObjectContentWarning(activity);
};

module.exports = {
  supportsContentWarning,
  sanitizeWarningText,
  deriveCanonicalWarningAndSensitive,
  normalizeObjectContentWarning,
  normalizeActivityContentWarning,
};
