'use strict';

const CURRENT_SCHEMA_VERSION = 1;

const KNOWN_CONSENT_SCOPES = new Set([
  'read:moderation',
  'write:moderation',
  'app:overrides',
  'read:trust',
  'write:trust'
]);
const TRUST_SOURCE_TYPES = new Set([
  'relay',
  'curator',
  'list',
  'algorithmic',
  'atproto-labeler',
  'domain-blocklist',
  'fediseer'
]);
const TRUST_SOURCE_SCOPES = new Set([
  'filter:content',
  'filter:actor',
  'label:content',
  'label:actor',
  'rank:down',
  'rank:up'
]);

const FILTER_ACTIONS = new Set(['hide', 'warn', 'filter']);
const FILTER_MATCH_TYPES = new Set(['word', 'phrase']);
const FILTER_DURATIONS = new Set(['indefinite', '12h', '1d', '1w', '1m']);

/**
 * Returns an error message string if validation fails, or null if valid.
 * All validators are pure functions with no side effects.
 */

function withSchemaVersion(data) {
  return {
    ...(data || {}),
    schemaVersion: data?.schemaVersion ?? CURRENT_SCHEMA_VERSION
  };
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizePermissions(permissions) {
  const scopeList = Array.isArray(permissions) ? permissions : permissions ? [permissions] : [];
  return [...new Set(scopeList.map(scope => normalizeString(scope)).filter(Boolean))];
}

function normalizeStringArray(values) {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  return [...new Set(list.map(value => normalizeString(value)).filter(Boolean))];
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

function isAtprotoDid(value) {
  return typeof value === 'string' && /^did:[a-z0-9]+:[A-Za-z0-9._:%-]+$/i.test(value.trim());
}

function isDomainPattern(value) {
  return (
    typeof value === 'string' &&
    /^(\*\.)?(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value.trim())
  );
}

function validateSchemaVersion(data) {
  if (!Number.isInteger(data.schemaVersion)) {
    return 'schemaVersion must be an integer';
  }
  if (data.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return `unsupported schemaVersion: ${data.schemaVersion}`;
  }
  return null;
}

function prepareFilter(data) {
  const prepared = withSchemaVersion({
    ...(data || {}),
    pattern: normalizeString(data?.pattern),
    action: normalizeString(data?.action),
    matchType: normalizeString(data?.matchType),
    includeHashtagVariants: data?.includeHashtagVariants,
    duration: normalizeString(data?.duration),
    expiresAt: normalizeString(data?.expiresAt),
    terms: normalizeStringArray(data?.terms)
  });

  if (!prepared.pattern && prepared.terms.length > 0) {
    prepared.pattern = prepared.terms[0];
  }

  if (prepared.terms.length === 0 && prepared.pattern) {
    prepared.terms = [prepared.pattern];
  }

  if (prepared.includeHashtagVariants === undefined) {
    prepared.includeHashtagVariants = true;
  }

  if (!prepared.matchType) {
    prepared.matchType = 'word';
  }

  if (!prepared.duration) {
    prepared.duration = 'indefinite';
  }

  return { data: prepared, error: validateFilter(prepared) };
}

function prepareMuteOrBlock(data) {
  const prepared = withSchemaVersion({
    ...(data || {}),
    subjectCanonicalId: normalizeString(data?.subjectCanonicalId),
    subjectProtocol: normalizeString(data?.subjectProtocol)
  });

  return { data: prepared, error: validateMuteOrBlock(prepared) };
}

function preparePreference(data) {
  const prepared = withSchemaVersion({
    ...(data || {}),
    category: normalizeString(data?.category)
  });

  return { data: prepared, error: validatePreference(prepared) };
}

function prepareAppConsent(data) {
  const prepared = withSchemaVersion({
    ...(data || {}),
    clientId: normalizeString(data?.clientId),
    permissions: normalizePermissions(data?.permissions)
  });

  return { data: prepared, error: validateAppConsent(prepared) };
}

function prepareTrustSource(data) {
  const prepared = withSchemaVersion({
    ...(data || {}),
    source: normalizeString(data?.source),
    sourceType: normalizeString(data?.sourceType),
    enabled: data?.enabled ?? true,
    weight: data?.weight ?? 1,
    scopes: normalizeStringArray(data?.scopes),
    name: normalizeString(data?.name),
    description: normalizeString(data?.description),
    icon: normalizeString(data?.icon)
  });

  if (data?.priority !== undefined) {
    prepared.priority = Number(data.priority);
  }

  return { data: prepared, error: validateTrustSource(prepared) };
}

function validateFilter(data) {
  if (!data) {
    return 'filter requires a non-empty pattern or terms';
  }
  const schemaError = validateSchemaVersion(withSchemaVersion(data));
  if (schemaError) {
    return schemaError;
  }
  const hasPattern = typeof data.pattern === 'string' && data.pattern.trim().length > 0;
  const hasTerms = Array.isArray(data.terms) && data.terms.length > 0;

  if (!hasPattern && !hasTerms) {
    return 'filter requires a non-empty pattern or terms';
  }
  if (data.action !== undefined && !FILTER_ACTIONS.has(data.action)) {
    return `filter action must be one of: ${[...FILTER_ACTIONS].join(', ')}`;
  }
  if (data.matchType !== undefined && !FILTER_MATCH_TYPES.has(data.matchType)) {
    return `filter matchType must be one of: ${[...FILTER_MATCH_TYPES].join(', ')}`;
  }
  if (data.includeHashtagVariants !== undefined && typeof data.includeHashtagVariants !== 'boolean') {
    return 'filter includeHashtagVariants must be boolean';
  }
  if (data.duration !== undefined && !FILTER_DURATIONS.has(data.duration)) {
    return `filter duration must be one of: ${[...FILTER_DURATIONS].join(', ')}`;
  }
  if (data.expiresAt !== undefined) {
    const expiresAt = Date.parse(data.expiresAt);
    if (Number.isNaN(expiresAt)) {
      return 'filter expiresAt must be an ISO date string';
    }
  }
  return null;
}

function validateMuteOrBlock(data) {
  if (!data) {
    return 'mute/block requires a non-empty subjectCanonicalId';
  }
  const schemaError = validateSchemaVersion(withSchemaVersion(data));
  if (schemaError) {
    return schemaError;
  }
  if (typeof data.subjectCanonicalId !== 'string' || data.subjectCanonicalId.trim().length === 0) {
    return 'mute/block requires a non-empty subjectCanonicalId';
  }
  if (!data.subjectProtocol || typeof data.subjectProtocol !== 'string') {
    return 'mute/block requires a non-empty subjectProtocol';
  }
  return null;
}

function validatePreference(data) {
  if (!data) {
    return 'preference requires a non-empty category';
  }
  const schemaError = validateSchemaVersion(withSchemaVersion(data));
  if (schemaError) {
    return schemaError;
  }
  if (typeof data.category !== 'string' || data.category.trim().length === 0) {
    return 'preference requires a non-empty category';
  }
  return null;
}

function validateAppConsent(data) {
  if (!data) {
    return 'app consent requires a non-empty clientId';
  }
  const schemaError = validateSchemaVersion(withSchemaVersion(data));
  if (schemaError) {
    return schemaError;
  }
  if (typeof data.clientId !== 'string' || data.clientId.trim().length === 0) {
    return 'app consent requires a non-empty clientId';
  }
  const perms = data.permissions;
  if (!perms || (Array.isArray(perms) && perms.length === 0)) {
    return 'app consent requires at least one scope in permissions';
  }
  const scopeList = normalizePermissions(perms);
  const unknown = scopeList.filter(s => !KNOWN_CONSENT_SCOPES.has(s));
  if (unknown.length > 0) {
    return `unknown consent scope(s): ${unknown.join(', ')}. Allowed: ${[...KNOWN_CONSENT_SCOPES].join(', ')}`;
  }
  if (scopeList.includes('write:moderation') && !scopeList.includes('read:moderation')) {
    return 'write:moderation requires read:moderation';
  }
  if (scopeList.includes('write:trust') && !scopeList.includes('read:trust')) {
    return 'write:trust requires read:trust';
  }
  return null;
}

function validateTrustSource(data) {
  if (!data) {
    return 'trust source requires a source';
  }
  const schemaError = validateSchemaVersion(withSchemaVersion(data));
  if (schemaError) {
    return schemaError;
  }
  if (typeof data.source !== 'string' || data.source.trim().length === 0) {
    return 'trust source requires a non-empty source';
  }
  if (!TRUST_SOURCE_TYPES.has(data.sourceType)) {
    return `trust source sourceType must be one of: ${[...TRUST_SOURCE_TYPES].join(', ')}`;
  }
  if (data.sourceType === 'atproto-labeler') {
    if (!isAtprotoDid(data.source) && !isHttpUrl(data.source)) {
      return 'ATProto labeler sources must be a DID or an http(s) declaration URL';
    }
  } else if (data.sourceType === 'fediseer') {
    if (!isDomainPattern(data.source) && !isHttpUrl(data.source)) {
      return 'Fediseer trust sources must be a fediverse domain or an http(s) URL';
    }
  } else if (data.sourceType === 'domain-blocklist') {
    if (!isDomainPattern(data.source) && !isHttpUrl(data.source)) {
      return 'domain blocklist sources must be a domain, wildcard domain, or http(s) URL';
    }
  } else if (!isHttpUrl(data.source)) {
    return 'trust source source must be an http(s) URI';
  }
  if (typeof data.enabled !== 'boolean') {
    return 'trust source enabled must be boolean';
  }
  if (typeof data.weight !== 'number' || Number.isNaN(data.weight)) {
    return 'trust source weight must be a number';
  }
  if (data.weight < 0 || data.weight > 1) {
    return 'trust source weight must be between 0 and 1';
  }
  if (!Array.isArray(data.scopes) || data.scopes.length === 0) {
    return 'trust source requires at least one scope';
  }
  const invalidScopes = data.scopes.filter(scope => !TRUST_SOURCE_SCOPES.has(scope));
  if (invalidScopes.length > 0) {
    return `invalid trust source scope(s): ${invalidScopes.join(', ')}`;
  }
  if (data.scopes.includes('filter:content') && !data.scopes.includes('label:content')) {
    return 'filter:content requires label:content';
  }
  if (data.scopes.includes('filter:actor') && !data.scopes.includes('label:actor')) {
    return 'filter:actor requires label:actor';
  }
  if (data.priority !== undefined && (!Number.isInteger(data.priority) || data.priority < 0)) {
    return 'trust source priority must be a non-negative integer';
  }
  if (data.icon !== undefined) {
    try {
      const url = new URL(data.icon);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return 'trust source icon must be an http(s) URI';
      }
    } catch {
      return 'trust source icon must be a valid URI';
    }
  }
  return null;
}

const PREPARERS_BY_CONTAINER = {
  filters: prepareFilter,
  mutes: prepareMuteOrBlock,
  blocks: prepareMuteOrBlock,
  preferences: preparePreference,
  'app-consents': prepareAppConsent,
  'trust-sources': prepareTrustSource
};

/**
 * Returns an error message if data is invalid for the given container, or null if valid.
 */
function validateForContainer(container, data) {
  return prepareForContainer(container, data).error;
}

function prepareForContainer(container, data) {
  const fn = PREPARERS_BY_CONTAINER[container];
  if (!fn) {
    return { data, error: null };
  }
  return fn(data);
}

module.exports = {
  validateFilter,
  validateMuteOrBlock,
  validatePreference,
  validateAppConsent,
  validateTrustSource,
  validateForContainer,
  prepareAppConsent,
  prepareForContainer,
  KNOWN_CONSENT_SCOPES,
  FILTER_ACTIONS,
  FILTER_MATCH_TYPES,
  FILTER_DURATIONS,
  CURRENT_SCHEMA_VERSION,
  TRUST_SOURCE_TYPES,
  TRUST_SOURCE_SCOPES
};
