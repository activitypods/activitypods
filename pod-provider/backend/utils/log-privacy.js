'use strict';

/**
 * Privacy-preserving log helpers.
 *
 * Policy:
 *   - Raw usernames, emails, and IPs are NEVER written to logs.
 *   - All PII is replaced by a keyed HMAC-SHA256 token before logging.
 *   - The same input always produces the same token within a deployment
 *     (deterministic — useful for correlating events without exposing the value).
 *   - Tokens are deployment-specific via SEMAPPS_LOG_HMAC_KEY, so they cannot
 *     be cross-correlated across instances even if logs are shared.
 *
 * Guidance: OWASP Logging Cheat Sheet — "Do not log sensitive data"
 *   https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
 */

const crypto = require('crypto');

// Fall back to a fixed weak key and warn loudly — operator must set this in production.
const LOG_HMAC_KEY = process.env.SEMAPPS_LOG_HMAC_KEY || null;

if (!LOG_HMAC_KEY && process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line no-console
  console.error(
    '[log-privacy] CRITICAL: SEMAPPS_LOG_HMAC_KEY is not set in production. ' +
    'Log tokens are NOT keyed and may be reversible. Set this env var immediately.'
  );
}

// Effective key: use the provided key or a per-process random fallback.
// The per-process random fallback means tokens are NOT correlated across restarts,
// which is intentional when no key is configured (prevents accidental PII indexing).
const EFFECTIVE_KEY = LOG_HMAC_KEY || crypto.randomBytes(32).toString('hex');

/**
 * Produce a short, deterministic, keyed HMAC-SHA256 token for a PII value.
 * Safe to write to logs and audit tables.
 *
 * @param {string} value - The raw PII value (username, email, IP, etc.)
 * @returns {string}     - 16-character hex string (64-bit token)
 */
function hashForLog(value) {
  if (!value || typeof value !== 'string') return 'null';
  return crypto
    .createHmac('sha256', EFFECTIVE_KEY)
    .update(value)
    .digest('hex')
    .slice(0, 16); // 64-bit prefix — enough for audit correlation, not enough for brute-force
}

/**
 * Produce a RFC 4122 v4 UUID suitable for use as a correlation ID.
 * Prefer ctx.id from the Moleculer context if available — only call this
 * as a fallback when generating IDs outside a Moleculer action context.
 *
 * @returns {string}
 */
function newCorrelationId() {
  return crypto.randomUUID();
}

module.exports = { hashForLog, newCorrelationId };
