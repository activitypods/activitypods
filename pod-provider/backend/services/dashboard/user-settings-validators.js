'use strict';

const KNOWN_CONSENT_SCOPES = new Set(['read:moderation', 'write:moderation', 'app:overrides', 'read:trust']);

const FILTER_ACTIONS = new Set(['hide', 'warn', 'filter']);

/**
 * Returns an error message string if validation fails, or null if valid.
 * All validators are pure functions with no side effects.
 */

function validateFilter(data) {
  if (!data || typeof data.pattern !== 'string' || data.pattern.trim().length === 0) {
    return 'filter requires a non-empty pattern';
  }
  if (data.action !== undefined && !FILTER_ACTIONS.has(data.action)) {
    return `filter action must be one of: ${[...FILTER_ACTIONS].join(', ')}`;
  }
  return null;
}

function validateMuteOrBlock(data) {
  if (!data || typeof data.subjectCanonicalId !== 'string' || data.subjectCanonicalId.trim().length === 0) {
    return 'mute/block requires a non-empty subjectCanonicalId';
  }
  if (!data.subjectProtocol || typeof data.subjectProtocol !== 'string') {
    return 'mute/block requires a non-empty subjectProtocol';
  }
  return null;
}

function validatePreference(data) {
  if (!data || typeof data.category !== 'string' || data.category.trim().length === 0) {
    return 'preference requires a non-empty category';
  }
  return null;
}

function validateAppConsent(data) {
  if (!data || typeof data.clientId !== 'string' || data.clientId.trim().length === 0) {
    return 'app consent requires a non-empty clientId';
  }
  const perms = data.permissions;
  if (!perms || (Array.isArray(perms) && perms.length === 0)) {
    return 'app consent requires at least one scope in permissions';
  }
  const scopeList = Array.isArray(perms) ? perms : [perms];
  const unknown = scopeList.filter(s => !KNOWN_CONSENT_SCOPES.has(s));
  if (unknown.length > 0) {
    return `unknown consent scope(s): ${unknown.join(', ')}. Allowed: ${[...KNOWN_CONSENT_SCOPES].join(', ')}`;
  }
  return null;
}

const VALIDATORS_BY_CONTAINER = {
  filters: validateFilter,
  mutes: validateMuteOrBlock,
  blocks: validateMuteOrBlock,
  preferences: validatePreference,
  'app-consents': validateAppConsent
};

/**
 * Returns an error message if data is invalid for the given container, or null if valid.
 */
function validateForContainer(container, data) {
  const fn = VALIDATORS_BY_CONTAINER[container];
  if (!fn) return null; // unknown container — already blocked upstream by requireContainer
  return fn(data);
}

module.exports = {
  validateFilter,
  validateMuteOrBlock,
  validatePreference,
  validateAppConsent,
  validateForContainer,
  KNOWN_CONSENT_SCOPES,
  FILTER_ACTIONS
};
