'use strict';

const CURRENT_SCHEMA_VERSION = 1;

const KNOWN_CONSENT_SCOPES = new Set(['read:moderation', 'write:moderation', 'app:overrides', 'read:trust']);

const FILTER_ACTIONS = new Set(['hide', 'warn', 'filter']);

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
    action: normalizeString(data?.action)
  });

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

function validateFilter(data) {
  if (!data) {
    return 'filter requires a non-empty pattern';
  }
  const schemaError = validateSchemaVersion(withSchemaVersion(data));
  if (schemaError) {
    return schemaError;
  }
  if (typeof data.pattern !== 'string' || data.pattern.trim().length === 0) {
    return 'filter requires a non-empty pattern';
  }
  if (data.action !== undefined && !FILTER_ACTIONS.has(data.action)) {
    return `filter action must be one of: ${[...FILTER_ACTIONS].join(', ')}`;
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
  return null;
}

const PREPARERS_BY_CONTAINER = {
  filters: prepareFilter,
  mutes: prepareMuteOrBlock,
  blocks: prepareMuteOrBlock,
  preferences: preparePreference,
  'app-consents': prepareAppConsent
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
  validateForContainer,
  prepareAppConsent,
  prepareForContainer,
  KNOWN_CONSENT_SCOPES,
  FILTER_ACTIONS,
  CURRENT_SCHEMA_VERSION
};
