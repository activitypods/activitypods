'use strict';

/**
 * Username suggestion engine.
 *
 * When a username is rejected, this generates up to maxSuggestions alternatives
 * that pass the full moderation pipeline.
 *
 * Strategy:
 *   1. Derive a "safe base" from the raw input (strip separators, lower, truncate).
 *   2. Try numbered variants: {base}{3-digit}
 *   3. Try neutral suffix variants: {base}_{suffix}
 *   4. Fall back to generic neutral bases + random numbers (for when the base itself is blocked).
 *   5. Validate every candidate through checkUsername before returning it.
 *
 * Enumeration resistance: suggestions do not surface which specific term was matched.
 */

const { checkUsername } = require('./username-checker');

const MAX_BASE_LEN = 16; // keep base short so suffixes fit within 30 chars
const MAX_SUGGESTIONS = 5;
const CANDIDATE_POOL = 40; // how many candidates to try before giving up

const NEUTRAL_SUFFIXES = ['hub', 'hq', 'pod', 'net', 'io', 'spot', 'node', 'desk'];

// Generic fallback bases — single-word English nouns unlikely to be blocked
const FALLBACK_BASES = [
  'explorer',
  'navigator',
  'pioneer',
  'voyager',
  'builder',
  'creator',
  'maker',
  'weaver',
  'anchor',
  'harbor'
];

/**
 * Generate username suggestions for a rejected input.
 *
 * @param {string} rawUsername           - The username the user attempted
 * @param {number} [max=5]              - Maximum suggestions to return
 * @returns {string[]}                   - Validated passing suggestions (may be fewer than max)
 */
function generateSuggestions(rawUsername, max = MAX_SUGGESTIONS) {
  // Derive safe base: keep only alphanumeric, lowercase, cap length
  const base = (rawUsername || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, MAX_BASE_LEN);

  const candidates = new Set();

  // ── Tier 1: numbered variants on the user's base ─────────────────────────
  if (base.length >= 2) {
    for (let i = 0; i < 12; i++) {
      const n = String(Math.floor(Math.random() * 900) + 100); // 100-999
      candidates.add(`${base}${n}`);
    }
  }

  // ── Tier 2: neutral suffix variants ──────────────────────────────────────
  if (base.length >= 2) {
    for (const suffix of NEUTRAL_SUFFIXES) {
      const candidate = `${base}_${suffix}`;
      if (candidate.length <= 30) candidates.add(candidate);
    }
  }

  // ── Tier 3: fallback bases + number (used when the base itself is blocked) ─
  for (const fb of FALLBACK_BASES) {
    const n = String(Math.floor(Math.random() * 900) + 100);
    candidates.add(`${fb}${n}`);
    if (candidates.size >= CANDIDATE_POOL) break;
  }

  // ── Validate each candidate through the full pipeline ────────────────────
  const suggestions = [];
  for (const candidate of candidates) {
    if (suggestions.length >= max) break;
    // Quick structural pre-filter to avoid unnecessary pipeline work
    if (candidate.length < 3 || candidate.length > 30) continue;
    if (!/^[a-z0-9._-]+$/.test(candidate)) continue;

    const result = checkUsername(candidate);
    if (result.decision === 'allow') {
      suggestions.push(candidate);
    }
  }

  return suggestions;
}

module.exports = { generateSuggestions };
