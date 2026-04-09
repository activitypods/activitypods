'use strict';

/**
 * Username moderation pipeline — Phase 1 deterministic core
 *
 * Tiers:
 *   A  Shape validation     — hard constraints, pure regex
 *   B  Unicode normalize    — NFKC + casefold + strip controls
 *   C  Unicode security     — confusable detection via unicode-confusables (UTS #39 fallback)
 *   D  Canonicalize         — no separators, collapse repeats, leet decode
 *   E  Lexical blocklist    — @2toad/profanity + custom lists
 *   F  Fuzzy matching       — Levenshtein distance against blocked/reserved terms
 *   G  Protected namespaces — exact + canonical exact match
 */

const { isConfusing, rectifyConfusion } = require('unicode-confusables');
const { Profanity, ProfanityOptions } = require('@2toad/profanity');
const { distance } = require('fastest-levenshtein');
const blockedConfig = require('../config/moderation/blocked-terms.json');
const reservedConfig = require('../config/moderation/reserved-names.json');

// ─── Constants ────────────────────────────────────────────────────────────────

const POLICY_VERSION = blockedConfig.version;

// Username shape constraints
const MIN_LEN = 3;
const MAX_LEN = 30;
// Allowed: lowercase a-z, 0-9, dot, underscore, hyphen
const ALLOWED_CHARSET = /^[a-z0-9._-]+$/;
// Must not start or end with punctuation
const NO_LEADING_PUNCT = /^[._-]/;
const NO_TRAILING_PUNCT = /[._-]$/;
// No repeated punctuation runs longer than 1
const REPEATED_PUNCT = /[._-]{2,}/;
// No all-numeric
const ALL_NUMERIC = /^\d+$/;
// No email-like shape
const EMAIL_LIKE = /^[^@]+@[^@]+$/;

// Leet-speak map for canonicalization
const LEET_MAP = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a',
  '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', '$': 's', '!': 'i', '+': 't'
};

// ─── Profanity filter setup ───────────────────────────────────────────────────

const profanityOptions = new ProfanityOptions();
profanityOptions.wholeWord = false; // catch sub-word matches for usernames
const profanityFilter = new Profanity(profanityOptions);

// ─── Blocklist helpers ────────────────────────────────────────────────────────

/**
 * Returns blocked terms as { term, category, severity, matchModes }[]
 * separated by severity.
 */
const hardBlockTerms = blockedConfig.terms.filter(t => t.severity === 'block');
const reviewTerms = blockedConfig.terms.filter(t => t.severity === 'review');
const allBlockedTermStrings = blockedConfig.terms.map(t => t.term);

const reservedSet = new Set(reservedConfig.reserved.map(s => s.toLowerCase()));
const reservedList = reservedConfig.reserved.map(s => s.toLowerCase());

// ─── Fuzzy thresholds ─────────────────────────────────────────────────────────
// We use Levenshtein distance (lower = more similar).
// For a string of length N, allow at most floor(N * tolerance) edits.
const HARD_BLOCK_TOLERANCE = 0.1;  // >= 90% similar → block
const REVIEW_TOLERANCE     = 0.15; // >= 85% similar → review

function similarityScore(a, b) {
  // Normalized similarity: 0..100 (100 = identical)
  if (a === b) return 100;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  return Math.round((1 - distance(a, b) / maxLen) * 100);
}

// ─── Stage A: shape validation ────────────────────────────────────────────────

function validateShape(username) {
  if (typeof username !== 'string' || username.length === 0) {
    return { ok: false, reason: 'invalid_empty', message: 'Username is required' };
  }
  // Lowercase before length check so we can give accurate feedback
  const lower = username.toLowerCase();
  if (lower.length < MIN_LEN) {
    return { ok: false, reason: 'invalid_length', message: `Username must be at least ${MIN_LEN} characters` };
  }
  if (lower.length > MAX_LEN) {
    return { ok: false, reason: 'invalid_length', message: `Username must be at most ${MAX_LEN} characters` };
  }
  if (!ALLOWED_CHARSET.test(lower)) {
    return { ok: false, reason: 'invalid_charset', message: 'Username may only contain letters, digits, dots, underscores, and hyphens' };
  }
  if (NO_LEADING_PUNCT.test(lower)) {
    return { ok: false, reason: 'invalid_format', message: 'Username must not start with punctuation' };
  }
  if (NO_TRAILING_PUNCT.test(lower)) {
    return { ok: false, reason: 'invalid_format', message: 'Username must not end with punctuation' };
  }
  if (REPEATED_PUNCT.test(lower)) {
    return { ok: false, reason: 'invalid_format', message: 'Username must not contain consecutive punctuation characters' };
  }
  if (ALL_NUMERIC.test(lower)) {
    return { ok: false, reason: 'invalid_format', message: 'Username must not be all numbers' };
  }
  if (EMAIL_LIKE.test(lower)) {
    return { ok: false, reason: 'invalid_format', message: 'Username must not look like an email address' };
  }
  return { ok: true };
}

// ─── Stage B: Unicode normalization ──────────────────────────────────────────

function normalizeUnicode(raw) {
  let s = raw;
  // NFKC: decompose + compose, maps ﬁ→fi, ² →2, etc.
  s = s.normalize('NFKC');
  // Lowercase / casefold
  s = s.toLowerCase();
  // Strip Unicode control characters, default-ignorable code points, zero-width chars
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001F\u007F-\u009F\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180B-\u180D\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFE00-\uFE0F\uFEFF\uFFF0-\uFFFB]/g, '');
  s = s.trim();
  return s;
}

// ─── Stage C: Unicode security ────────────────────────────────────────────────

function analyzeUnicodeSecurity(normalized) {
  const hasInvisible = normalized.length === 0 || /[\u200B-\u200F\uFEFF]/.test(normalized);
  const hasMixedScript = detectMixedScript(normalized);
  const isConfusableChar = isConfusing(normalized);
  const skeleton = rectifyConfusion(normalized);

  return { hasInvisible, hasMixedScript, isConfusableChar, skeleton };
}

/**
 * Rough mixed-script detector: if the string contains both Latin (a-z0-9)
 * and non-Latin non-ASCII characters (Cyrillic, Greek, etc.), flag it.
 */
function detectMixedScript(s) {
  const hasLatin = /[a-z0-9._\-]/.test(s);
  const hasNonLatin = /[^\x00-\x7F]/.test(s);
  return hasLatin && hasNonLatin;
}

// ─── Stage D: canonicalization ────────────────────────────────────────────────

/**
 * Build canonical form from a (possibly non-ASCII) string.
 * NOTE: rectifyConfusion is intentionally NOT applied here — it maps valid
 * ASCII chars like 'm'→'rn', corrupting the leet-decode result.
 * Confusable-skeleton logic lives exclusively in Stage C (analyzeUnicodeSecurity).
 */
function canonicalize(normalized) {
  let s = normalized;
  // 1. Remove separators
  s = s.replace(/[._-]/g, '');
  // 2. Collapse repeated characters: sluuuurr → slur (max 2 identical in a row)
  s = s.replace(/(.)\1{2,}/g, '$1$1');
  // 3. Leet decode (digit and symbol substitutions)
  s = s.replace(/[013456789@$!+]/g, ch => LEET_MAP[ch] || ch);
  // 4. Collapse again after leet decode (e.g. 1337 → iiig → iig)
  s = s.replace(/(.)\1{2,}/g, '$1$1');
  return s;
}

// ─── Stage E: lexical blocklist ───────────────────────────────────────────────

/**
 * Run @2toad/profanity and custom blocklist against multiple forms.
 * Returns { blocked: bool, severity: 'block'|'review'|null, matchedTerm: string|null }
 */
function checkLexical(forms) {
  for (const form of forms) {
    // @2toad/profanity (covers standard English profanity)
    if (profanityFilter.exists(form)) {
      return { blocked: true, severity: 'block', matchedTerm: form, reason: 'profanity' };
    }
  }

  // Custom blocklist: check each form against each term's match modes
  for (const entry of hardBlockTerms) {
    for (const form of forms) {
      if (entry.matchModes.includes('exact') && form === entry.term) {
        return { blocked: true, severity: 'block', matchedTerm: entry.term, reason: 'blocked_term' };
      }
      if (entry.matchModes.includes('canonical') && form.includes(entry.term)) {
        return { blocked: true, severity: 'block', matchedTerm: entry.term, reason: 'blocked_term_contains' };
      }
    }
  }
  for (const entry of reviewTerms) {
    for (const form of forms) {
      if (entry.matchModes.includes('exact') && form === entry.term) {
        return { blocked: true, severity: 'review', matchedTerm: entry.term, reason: 'review_term' };
      }
      if (entry.matchModes.includes('canonical') && form.includes(entry.term)) {
        return { blocked: true, severity: 'review', matchedTerm: entry.term, reason: 'review_term_contains' };
      }
    }
  }
  return { blocked: false, severity: null, matchedTerm: null, reason: null };
}

// ─── Stage F: fuzzy matching ──────────────────────────────────────────────────

function checkFuzzy(canonical) {
  const len = canonical.length;
  // Very short strings get strict exact-only treatment to avoid false positives
  if (len < 4) return { blocked: false, severity: null, matchedTerm: null, score: 0 };

  let bestScore = 0;
  let bestTerm = null;
  let bestSeverity = null;

  for (const term of allBlockedTermStrings) {
    // Only fuzzy-check terms where matchModes includes 'fuzzy'
    const entry = blockedConfig.terms.find(t => t.term === term);
    if (!entry || !entry.matchModes.includes('fuzzy')) continue;

    const score = similarityScore(canonical, term);
    if (score > bestScore) {
      bestScore = score;
      bestTerm = term;
      bestSeverity = entry.severity;
    }
  }

  // Also check reserved names
  for (const reserved of reservedList) {
    const score = similarityScore(canonical, reserved);
    if (score > bestScore) {
      bestScore = score;
      bestTerm = reserved;
      bestSeverity = 'block';
    }
  }

  const hardBlockThreshold = Math.round((1 - HARD_BLOCK_TOLERANCE) * 100); // 90
  const reviewThreshold = Math.round((1 - REVIEW_TOLERANCE) * 100);         // 85

  if (bestScore >= hardBlockThreshold) {
    return { blocked: true, severity: 'block', matchedTerm: bestTerm, score: bestScore };
  }
  if (bestScore >= reviewThreshold) {
    return { blocked: true, severity: 'review', matchedTerm: bestTerm, score: bestScore };
  }
  return { blocked: false, severity: null, matchedTerm: null, score: bestScore };
}

// ─── Stage G: protected namespace check ──────────────────────────────────────

function checkProtectedNamespace(normalized, canonical) {
  if (reservedSet.has(normalized)) {
    return { blocked: true, severity: 'block', reason: 'reserved_exact' };
  }
  if (reservedSet.has(canonical)) {
    return { blocked: true, severity: 'block', reason: 'reserved_canonical' };
  }
  // Check if username starts with a reserved prefix
  const reservedPrefixes = ['admin-', 'support-', 'official-', 'staff-', 'mod-', 'security-'];
  for (const prefix of reservedPrefixes) {
    if (normalized.startsWith(prefix) || canonical.startsWith(prefix.replace('-', ''))) {
      return { blocked: true, severity: 'block', reason: 'reserved_prefix' };
    }
  }
  return { blocked: false, reason: null };
}

// ─── Main entrypoint ─────────────────────────────────────────────────────────

/**
 * @param {string} rawUsername
 * @returns {{ decision: 'allow'|'block'|'review', reasons: string[], scores: object, artifacts: object, policyVersion: string }}
 */
function checkUsername(rawUsername) {
  const reasons = [];
  const scores = {};

  // Stage A: shape
  const shapeResult = validateShape(rawUsername);
  if (!shapeResult.ok) {
    return {
      decision: 'block',
      reasons: [shapeResult.reason],
      message: shapeResult.message,
      scores,
      artifacts: { raw: rawUsername, normalized: null, canonical: null, skeleton: null },
      policyVersion: POLICY_VERSION
    };
  }

  // Stage B: normalize
  const normalized = normalizeUnicode(rawUsername);
  if (!normalized) {
    return {
      decision: 'block',
      reasons: ['empty_after_normalization'],
      message: 'Username is empty after normalization',
      scores,
      artifacts: { raw: rawUsername, normalized, canonical: null, skeleton: null },
      policyVersion: POLICY_VERSION
    };
  }

  // Stage C: unicode security
  const unicodeSec = analyzeUnicodeSecurity(normalized);
  const skeleton = unicodeSec.skeleton || normalized;

  if (unicodeSec.hasInvisible) {
    reasons.push('invisible_characters');
  }
  if (unicodeSec.hasMixedScript) {
    reasons.push('mixed_script');
  }
  if (reasons.length > 0) {
    return {
      decision: 'block',
      reasons,
      message: 'Username not allowed',
      scores,
      artifacts: { raw: rawUsername, normalized, canonical: null, skeleton },
      policyVersion: POLICY_VERSION
    };
  }

  // Stage D: canonicalize
  const canonical = canonicalize(normalized);
  // Only compute skeleton-based canonical when input actually has non-ASCII chars
  // (unicode-confusables over-maps ASCII chars like 'm'→'rn' which corrupts results)
  const hasNonAscii = /[^\x00-\x7F]/.test(normalized);
  const canonicalFromSkeleton = hasNonAscii ? canonicalize(skeleton) : canonical;

  if (hasNonAscii && canonical !== canonicalFromSkeleton) {
    scores.confusableDetected = true;
  }

  // Build candidate forms for lexical checks
  const forms = Array.from(new Set([normalized, canonical, skeleton, canonicalFromSkeleton]));

  // Stage E: lexical
  const lexResult = checkLexical(forms);
  if (lexResult.blocked) {
    if (lexResult.severity === 'block') {
      return {
        decision: 'block',
        reasons: [lexResult.reason],
        message: 'Username not allowed',
        scores,
        artifacts: { raw: rawUsername, normalized, canonical, skeleton },
        policyVersion: POLICY_VERSION
      };
    }
    reasons.push(lexResult.reason);
  }

  // Stage F: fuzzy
  const fuzzyResult = checkFuzzy(canonical);
  scores.fuzzyScore = fuzzyResult.score;
  scores.fuzzyMatchedTerm = fuzzyResult.matchedTerm;

  if (fuzzyResult.blocked) {
    if (fuzzyResult.severity === 'block') {
      return {
        decision: 'block',
        reasons: ['fuzzy_blocked_term'],
        message: 'Username not allowed',
        scores,
        artifacts: { raw: rawUsername, normalized, canonical, skeleton },
        policyVersion: POLICY_VERSION
      };
    }
    reasons.push('fuzzy_review_term');
  }

  // Also fuzzy check the skeleton form to catch confusable-encoded blocked terms
  // Only meaningful when input had non-ASCII characters
  if (hasNonAscii && skeleton !== normalized) {
    const fuzzySkeletonResult = checkFuzzy(canonicalFromSkeleton);
    if (fuzzySkeletonResult.blocked && fuzzySkeletonResult.severity === 'block') {
      return {
        decision: 'block',
        reasons: ['confusable_blocked_term'],
        message: 'Username not allowed',
        scores,
        artifacts: { raw: rawUsername, normalized, canonical, skeleton },
        policyVersion: POLICY_VERSION
      };
    }
  }

  // Stage G: protected namespace
  const nsResult = checkProtectedNamespace(normalized, canonical);
  if (nsResult.blocked) {
    return {
      decision: 'block',
      reasons: [nsResult.reason],
      message: 'This username is reserved',
      scores,
      artifacts: { raw: rawUsername, normalized, canonical, skeleton },
      policyVersion: POLICY_VERSION
    };
  }

  // Aggregate decision
  const decision = reasons.length > 0 ? 'review' : 'allow';

  return {
    decision,
    reasons,
    message: decision === 'allow' ? null : 'Username flagged for review',
    scores,
    artifacts: { raw: rawUsername, normalized, canonical, skeleton },
    policyVersion: POLICY_VERSION
  };
}

module.exports = { checkUsername, POLICY_VERSION };
