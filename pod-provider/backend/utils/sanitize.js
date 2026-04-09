'use strict';

/**
 * Input sanitization utilities.
 *
 * Applied at every system boundary (HTTP request parsing, before any domain logic).
 * Hardened against: null bytes, oversized input, type coercion attacks, binary data.
 */

const MAX_USERNAME_BYTES = 256; // hard truncation before length policy
const MAX_OPTIONAL_BYTES = 128;
const ACCEPTABLE_CONTENT_TYPE = 'application/json';

// Regex to detect non-printable / control characters (C0, C1, DEL, private-use surrogates)
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x80-\x9F]/;

/**
 * Safely coerce a value to a string — only accepts actual strings.
 * Does NOT coerce numbers, objects, or arrays (prevents prototype pollution
 * and unexpected string representations like "[object Object]").
 *
 * @param {unknown} value
 * @returns {string|null}
 */
function coerceString(value) {
  if (typeof value === 'string') return value;
  return null;
}

/**
 * Sanitize a username-class input string.
 *
 * Steps:
 *   1. Reject non-strings silently (returns null)
 *   2. Strip null bytes (CVE-class: null-byte injection can bypass string checks)
 *   3. Detect non-printable / control characters → return null
 *   4. Hard-truncate to MAX_USERNAME_BYTES
 *   5. Trim surrounding whitespace
 *   6. Return null if result is empty
 *
 * @param {unknown} raw
 * @returns {string|null}
 */
function sanitizeUsername(raw) {
  const s = coerceString(raw);
  if (s === null) return null;

  // Null-byte rejection
  if (s.includes('\x00')) return null;

  // Control character rejection
  if (CONTROL_CHARS.test(s)) return null;

  // Hard truncation (prevents algorithmic complexity attacks in downstream regex)
  const truncated = s.slice(0, MAX_USERNAME_BYTES);
  const trimmed = truncated.trim();

  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Sanitize an optional free-form string field (displayName, localeHint, etc.).
 * More permissive than sanitizeUsername — allows spaces and punctuation.
 *
 * @param {unknown} raw
 * @param {number}  [maxLen]
 * @returns {string|null}
 */
function sanitizeOptionalString(raw, maxLen = MAX_OPTIONAL_BYTES) {
  const s = coerceString(raw);
  if (s === null) return null;
  if (s.includes('\x00')) return null;
  const trimmed = s.slice(0, maxLen).trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Validate that the Content-Type header is application/json.
 * Guards against CSRF via form-POST attacks (form submissions cannot set this header).
 *
 * @param {string|undefined} contentType
 * @returns {boolean}
 */
function isJsonContentType(contentType) {
  if (!contentType) return false;
  return contentType.split(';')[0].trim().toLowerCase() === ACCEPTABLE_CONTENT_TYPE;
}

/**
 * Sanitize a client IP string for use in rate-limit key generation.
 * Accepts IPv4, IPv6, and IPv4-mapped-IPv6 (::ffff:x.x.x.x) formats.
 * Returns null for anything that doesn't look like an IP.
 *
 * @param {string|undefined|null} raw
 * @returns {string|null}
 */
function sanitizeIp(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const ip = raw.trim().slice(0, 45); // IPv6 max 45 chars
  // Basic structural check — not full validation, but prevents injection in Redis keys
  if (!/^[0-9a-fA-F:.]+$/.test(ip)) return null;
  return ip;
}

module.exports = {
  sanitizeUsername,
  sanitizeOptionalString,
  sanitizeIp,
  isJsonContentType,
  coerceString
};
