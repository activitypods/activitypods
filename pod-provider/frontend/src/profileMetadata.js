const LEGACY_PROPERTY_VALUE_TYPES = new Set([
  'PropertyValue',
  'schema:PropertyValue',
  'http://schema.org#PropertyValue',
  'https://schema.org/PropertyValue'
]);

const LEGACY_VALUE_KEYS = ['value', 'http://schema.org#value', 'https://schema.org/value'];
const MAX_ATTRIBUTION_DOMAINS = 10;

const toArray = value => (Array.isArray(value) ? value : value != null ? [value] : []);

const normalizeString = value => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const splitRel = rel =>
  toArray(rel)
    .flatMap(value => (typeof value === 'string' ? value.split(/\s+/) : []))
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);

const hasRelMe = rel => splitRel(rel).includes('me');

const normalizeUrl = value => {
  if (typeof value !== 'string') return null;
  try {
    const parsed = new URL(value.trim());
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.href;
  } catch {
    return null;
  }
};

const normalizeDomain = value => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed.replace(/^\/+/, '')}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.username || parsed.password || !parsed.hostname) return null;
    return parsed.hostname.toLowerCase().replace(/\.+$/, '') || null;
  } catch {
    return null;
  }
};

const extractLegacyValue = item => {
  for (const key of LEGACY_VALUE_KEYS) {
    if (typeof item?.[key] === 'string' && item[key].trim()) {
      return item[key].trim();
    }
  }
  return '';
};

const inferFieldFromLegacyValue = (name, value) => {
  const normalizedHref = normalizeUrl(value);
  if (normalizedHref) {
    return {
      name,
      value: normalizedHref,
      kind: 'link',
      relMe: /\brel\s*=\s*['"][^'"]*\bme\b/i.test(value)
    };
  }

  const anchorMatch = value.match(/href\s*=\s*['"]([^'"]+)['"]/i);
  if (anchorMatch?.[1]) {
    const href = normalizeUrl(anchorMatch[1]);
    if (href) {
      return {
        name,
        value: href,
        kind: 'link',
        relMe: /\brel\s*=\s*['"][^'"]*\bme\b/i.test(value)
      };
    }
  }

  return {
    name,
    value,
    kind: 'text',
    relMe: false
  };
};

export const attachmentToProfileField = item => {
  if (!item || typeof item !== 'object') return null;

  const name = normalizeString(item.name);
  if (!name) return null;

  const types = toArray(item.type || item['@type']);

  if (types.includes('Note')) {
    const content = normalizeString(item.content);
    if (!content) return null;
    return { name, value: content, kind: 'text', relMe: false };
  }

  if (types.includes('Link')) {
    const href = normalizeUrl(item.href || item.url);
    if (!href) return null;
    return {
      name,
      value: href,
      kind: 'link',
      relMe: hasRelMe(item.rel),
      verified: Boolean(item.verified),
      verificationReason: normalizeString(item.verificationReason) || undefined,
      verifiedAt: normalizeString(item.verifiedAt) || undefined
    };
  }

  if (types.some(type => LEGACY_PROPERTY_VALUE_TYPES.has(type))) {
    const value = extractLegacyValue(item);
    if (!value) return null;
    return inferFieldFromLegacyValue(name, value);
  }

  return null;
};

export const extractProfileFields = attachment => toArray(attachment).map(attachmentToProfileField).filter(Boolean);

export const createEmptyProfileField = () => ({
  name: '',
  value: '',
  kind: 'text',
  relMe: false
});

export const buildProfileFormDefaults = actor => ({
  ...actor,
  metadataFields: extractProfileFields(actor?.attachment),
  attributionDomains: extractAuthorAttributionDomains(actor?.attributionDomains)
});

export const extractAuthorAttributionDomains = value => [
  ...new Set(toArray(value).map(normalizeDomain).filter(Boolean))
];

export const normalizeAuthorAttributionDomains = value => {
  const normalized = [];
  let invalid = false;

  for (const item of toArray(value)) {
    if (item == null) continue;
    if (typeof item !== 'string') {
      invalid = true;
      continue;
    }

    const trimmed = item.trim();
    if (!trimmed) continue;

    const domain = normalizeDomain(trimmed);
    if (!domain) {
      invalid = true;
      continue;
    }

    normalized.push(domain);
  }

  const unique = [...new Set(normalized)];
  if (invalid) {
    const error = new Error('Invalid author attribution domain');
    error.code = 'INVALID_AUTHOR_ATTRIBUTION_DOMAIN';
    throw error;
  }
  if (unique.length > MAX_ATTRIBUTION_DOMAINS) {
    const error = new Error('Too many author attribution domains');
    error.code = 'TOO_MANY_AUTHOR_ATTRIBUTION_DOMAINS';
    throw error;
  }

  return unique;
};

export const mergeProfileFieldsIntoAttachment = (existingAttachment, metadataFields) => {
  const preserved = toArray(existingAttachment).filter(item => !attachmentToProfileField(item));

  const generated = toArray(metadataFields)
    .map(field => ({
      name: normalizeString(field?.name),
      value: normalizeString(field?.value),
      kind: field?.kind === 'link' ? 'link' : 'text',
      relMe: Boolean(field?.relMe)
    }))
    .filter(field => field.name && field.value)
    .map(field => {
      if (field.kind === 'link') {
        const href = normalizeUrl(field.value);
        if (!href) {
          const error = new Error(`Invalid URL for metadata field "${field.name}"`);
          error.code = 'INVALID_PROFILE_METADATA_URL';
          throw error;
        }

        return {
          type: 'Link',
          name: field.name,
          href,
          ...(field.relMe ? { rel: ['me'] } : {})
        };
      }

      return {
        type: 'Note',
        name: field.name,
        content: field.value
      };
    });

  return [...preserved, ...generated];
};
