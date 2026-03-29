const crypto = require('crypto');

function sha256(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('hex');
}

function randomToken(byteLength = 32) {
  return crypto.randomBytes(byteLength).toString('base64url');
}

function nowEpochSec() {
  return Math.floor(Date.now() / 1000);
}

function sanitizeErrorMessage(message) {
  return String(message || 'Request failed')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
    .replace(/(access_token|refresh_token|code_verifier|password)\s*[:=]\s*["'][^"']+["']/gi, '$1:[redacted]')
    .replace(/(access_token|refresh_token|code_verifier|password)\s*[:=]\s*[^\s,]+/gi, '$1:[redacted]');
}

function parseBoolean(input, fallback = false) {
  if (input == null) return fallback;
  const normalized = String(input).trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no') return false;
  return fallback;
}

function parseIntWithBounds(raw, fallback, min, max, key) {
  if (raw == null || raw === '') return fallback;
  if (!/^[0-9]+$/.test(String(raw))) {
    throw new Error(`${key} must be a positive integer`);
  }
  const parsed = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`${key} must be between ${min} and ${max}`);
  }
  return parsed;
}

function assertHttpsUrl(url, { allowLocalhostHttp = false, field = 'url' } = {}) {
  const parsed = new URL(String(url));
  if (parsed.protocol === 'https:') return parsed;
  if (allowLocalhostHttp && parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
    return parsed;
  }
  throw new Error(`${field} must use https`);
}

module.exports = {
  sha256,
  randomToken,
  nowEpochSec,
  sanitizeErrorMessage,
  parseBoolean,
  parseIntWithBounds,
  assertHttpsUrl
};
