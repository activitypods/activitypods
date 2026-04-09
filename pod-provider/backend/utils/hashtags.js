const HASHTAG_BODY_RE = /^(?!\d+\b)[\p{L}\p{N}_]+$/u;
const HASHTAG_WITH_PREFIX_RE = /^#(?!\d+\b)[\p{L}\p{N}_]+$/u;
const HASHTAG_SCAN_RE = /#(?!\d+\b)([\p{L}\p{N}_]+)/gu;

const PUBLIC_HASHTAG_TYPE = 'Hashtag';
const HASHTAG_LINK_SCAN_RE = /(^|[^\p{L}\p{N}_&;\/])#(?!\d+\b)([\p{L}\p{N}_]+)/gu;

const toArray = value => (Array.isArray(value) ? value : value ? [value] : []);

const parseOrigin = value => {
  if (typeof value !== 'string') return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const deriveHashtagBaseUrl = object => {
  if (!object || typeof object !== 'object') {
    return null;
  }

  const urlValues = toArray(object.url);
  for (const entry of urlValues) {
    if (typeof entry === 'string') {
      const origin = parseOrigin(entry);
      if (origin) return origin;
      continue;
    }
    if (entry && typeof entry === 'object' && typeof entry.href === 'string') {
      const origin = parseOrigin(entry.href);
      if (origin) return origin;
    }
  }

  const idOrigin = parseOrigin(object.id);
  if (idOrigin) return idOrigin;

  const attributedTo = object.attributedTo;
  if (typeof attributedTo === 'string') {
    return parseOrigin(attributedTo);
  }
  if (attributedTo && typeof attributedTo === 'object') {
    return parseOrigin(attributedTo.id || attributedTo['@id'] || attributedTo.href);
  }

  return null;
};

const buildHashtagHref = (baseUrl, hashtagBody) => {
  if (!baseUrl || typeof baseUrl !== 'string') {
    return undefined;
  }
  return `${baseUrl.replace(/\/$/, '')}/tags/${encodeURIComponent(hashtagBody)}`;
};

const escapeHtml = value =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const stripHtml = text =>
  typeof text === 'string' ? text.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ').trim() : '';

const linkifyHashtagsInHtml = (html, { baseUrl } = {}) => {
  if (typeof html !== 'string' || html.length === 0) {
    return html;
  }

  const origin = parseOrigin(baseUrl);
  if (!origin) return html;

  const segments = html.split(/(<[^>]+>)/g);
  let insideExcluded = 0;

  return segments
    .map(segment => {
      if (!segment) return "";
      if (segment.startsWith('<')) {
        const tagName = segment.match(/^<\/?([a-z0-9]+)/i)?.[1]?.toLowerCase();
        if (['pre', 'code', 'a'].includes(tagName)) {
          if (segment.startsWith('</')) {
            insideExcluded = Math.max(0, insideExcluded - 1);
          } else if (!segment.endsWith('/>')) {
            insideExcluded++;
          }
        }
        return segment;
      }

      if (insideExcluded > 0) return segment;

      return segment.replace(HASHTAG_LINK_SCAN_RE, (match, prefix, body) => {
        const normalized = normalizeHashtagBody(body);
        if (!normalized) {
          return match;
        }

        const href = buildHashtagHref(origin, normalized);
        if (!href) {
          return `${prefix}#${escapeHtml(body)}`;
        }

        return `${prefix}<a href="${escapeHtml(href)}" class="mention hashtag" rel="tag">#${escapeHtml(body)}</a>`;
      });
    })
    .join('');
};

const normalizeHashtagBody = value => {
  if (!HASHTAG_BODY_RE.test(value)) {
    return null;
  }
  return value.toLowerCase();
};

const normalizeHashtag = (value, { allowMissingHash = false } = {}) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('#')) {
    if (!HASHTAG_WITH_PREFIX_RE.test(trimmed)) {
      return null;
    }
    return normalizeHashtagBody(trimmed.slice(1));
  }

  if (!allowMissingHash) {
    return null;
  }

  return normalizeHashtagBody(trimmed);
};

const extractHashtagsFromText = text => {
  const input = stripHtml(text);
  if (!input) {
    return [];
  }

  const hashtags = new Set();
  const matches = input.matchAll(HASHTAG_SCAN_RE);

  for (const match of matches) {
    const body = match[1];
    if (!body) {
      continue;
    }
    const normalized = normalizeHashtagBody(body);
    if (normalized) {
      hashtags.add(normalized);
    }
  }

  return Array.from(hashtags);
};

const extractHashtagsFromActivityPubTags = tags => {
  const hashtagSet = new Set();

  for (const tag of toArray(tags)) {
    if (!tag || typeof tag !== 'object') {
      continue;
    }
    if (tag.type !== PUBLIC_HASHTAG_TYPE || typeof tag.name !== 'string') {
      continue;
    }
    const normalized = normalizeHashtag(tag.name);
    if (normalized) {
      hashtagSet.add(normalized);
    }
  }

  return Array.from(hashtagSet);
};

const normalizeActivityPubObjectHashtags = object => {
  if (!object || typeof object !== 'object') {
    return object;
  }

  const fromTags = extractHashtagsFromActivityPubTags(object.tag);
  const fromContent = extractHashtagsFromText(object.content);
  const normalizedHashtags = Array.from(new Set([...fromTags, ...fromContent]));

  if (normalizedHashtags.length === 0) {
    return object;
  }

  const existingTags = toArray(object.tag);
  const baseUrl = deriveHashtagBaseUrl(object);
  const nonHashtagTags = existingTags.filter(tag => {
    if (!tag || typeof tag !== 'object') {
      return true;
    }
    return tag.type !== PUBLIC_HASHTAG_TYPE;
  });

  const hashtagTags = normalizedHashtags.map(tag => ({
    type: PUBLIC_HASHTAG_TYPE,
    name: `#${escapeHtml(tag)}`,
    href: buildHashtagHref(baseUrl, tag), // buildHashtagHref already handles URI encoding
  }));

  return {
    ...object,
    tag: [...nonHashtagTags, ...hashtagTags],
  };
};

module.exports = {
  normalizeHashtag,
  extractHashtagsFromText,
  extractHashtagsFromActivityPubTags,
  normalizeActivityPubObjectHashtags,
  deriveHashtagBaseUrl,
  buildHashtagHref,
  linkifyHashtagsInHtml,
};
