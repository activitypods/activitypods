'use strict';

/**
 * Moleculer service: username-moderation
 *
 * Exposes:
 *   POST /v1/usernames/check      (HTTP, public — full moderation pipeline, no availability check)
 *   GET  /v1/usernames/available  (HTTP, public — moderation + database availability check)
 *   username-moderation.assertSafe (internal — called from auth.js before.signup hook)
 *   username-moderation.check      (internal — raw pipeline result, no side effects)
 *   username-moderation.policyVersion
 *
 * Security:
 *   - RFC 9457 Problem Details for all HTTP error responses
 *   - Redis sliding-window rate limiting (via rate-limiter service)
 *   - Input sanitization at the boundary (sanitize.js)
 *   - Privacy-minimized audit log (log-privacy.js) — no raw PII in logs
 *   - Enumeration resistance: all block/review reasons are mapped to generic codes
 *   - Retry-After header on 429 responses
 *   - X-Correlation-ID on every response for incident investigation
 *   - Suggestions generated for all rejected usernames
 *   - Borderline (review) decisions queued asynchronously for moderator review
 */

const { MoleculerClientError } = require('moleculer').Errors;
const { checkUsername, POLICY_VERSION } = require('../../utils/username-checker');
const { sanitizeUsername, sanitizeIp }  = require('../../utils/sanitize');
const { generateSuggestions }           = require('../../utils/username-suggestions');
const { hashForLog }                    = require('../../utils/log-privacy');

// Base URI for RFC 9457 type URIs — must match your domain in production
const PROBLEM_BASE = 'https://activitypods.org/problems';

// ─── Reason obfuscation map ───────────────────────────────────────────────────
// Maps internal reason codes to generic external codes.
// Prevents information leakage about which specific term was matched (enumeration resistance).
const REASON_MAP = {
  invalid_length:               'invalid_format',
  invalid_charset:              'invalid_format',
  invalid_format:               'invalid_format',
  invalid_empty:                'invalid_format',
  empty_after_normalization:    'invalid_format',
  invisible_characters:         'not_available',
  mixed_script:                 'not_available',
  profanity:                    'not_available',
  blocked_term:                 'not_available',
  blocked_term_contains:        'not_available',
  fuzzy_blocked_term:           'not_available',
  confusable_blocked_term:      'not_available',
  reserved_exact:               'not_available',
  reserved_canonical:           'not_available',
  reserved_prefix:              'not_available',
  review_term:                  'flagged_for_review',
  review_term_contains:         'flagged_for_review',
  fuzzy_review_term:            'flagged_for_review',
  invalid_input:                'invalid_format'
};

function obfuscateReasons(reasons) {
  return [...new Set(reasons.map(r => REASON_MAP[r] || 'not_available'))];
}

// ─── RFC 9457 Problem Details helper ─────────────────────────────────────────

/**
 * Build a RFC 9457 Problem Details object.
 * https://www.rfc-editor.org/rfc/rfc9457
 *
 * @param {number} status   - HTTP status code
 * @param {string} type     - Slug appended to PROBLEM_BASE
 * @param {string} title    - Short, human-readable summary (stable across occurrences)
 * @param {string} [detail] - Instance-specific detail (MUST NOT contain PII)
 * @param {string} [instance] - The request path
 * @returns {object}
 */
function problemDetails(status, type, title, detail, instance) {
  const obj = {
    type:   `${PROBLEM_BASE}/${type}`,
    title,
    status
  };
  if (detail)   obj.detail   = detail;
  if (instance) obj.instance = instance;
  return obj;
}

// ─── IP extraction helper ─────────────────────────────────────────────────────

function getClientIp(ctx) {
  const headers = ctx.meta?.$requestHeaders || {};
  // Trust X-Forwarded-For only if the deployment uses a trusted reverse proxy.
  // The first IP in XFF is the client; subsequent IPs are intermediate proxies.
  const xff = headers['x-forwarded-for'];
  if (xff) return sanitizeIp(xff.split(',')[0].trim());
  return sanitizeIp(headers['x-real-ip'] || null);
}

// ─── Service definition ───────────────────────────────────────────────────────

module.exports = {
  name: 'username-moderation',

  // Register route after the API gateway starts
  dependencies: ['api'],

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        name: 'username-moderation',
        path: '/v1/usernames',

        // Strict body parser — reject anything over 8 KB, no URL-encoded form data
        bodyParsers: {
          json:       { limit: '8kb', strict: true },
          urlencoded: false
        },

        // RFC 9457 error formatter for this route
        onError(req, res, err) {
          const status = err.code || err.status || 500;
          const body   = problemDetails(
            status,
            err.type?.toLowerCase().replace(/_/g, '-') || 'internal-error',
            err.message || 'An unexpected error occurred',
            undefined,
            req.url
          );
          res.setHeader('Content-Type', 'application/problem+json');
          res.writeHead(status);
          res.end(JSON.stringify(body));
        },

        aliases: {
          'POST /check':      'username-moderation.httpCheck',
          'GET /available':   'username-moderation.httpAvailable'
        }
      }
    });

    this.logger.info('[username-moderation] HTTP routes registered at /v1/usernames/{check,available}');
  },

  actions: {
    // ── Public HTTP endpoint ──────────────────────────────────────────────────
    /**
     * POST /v1/usernames/check
     *
     * Request body:
     *   { username, displayName?, localeHint?, flow? }
     *
     * Responses:
     *   200 { decision, reasons, scores, artifacts, suggestions, correlationId, policyVersion }
     *   400 application/problem+json — malformed input
     *   429 application/problem+json — rate limited
     *   500 application/problem+json — internal error
     */
    httpCheck: {
      // Relaxed params — sanitize manually to provide precise error messages
      params: {
        username:    { type: 'string', optional: true },
        displayName: { type: 'string', optional: true },
        localeHint:  { type: 'string', optional: true },
        flow:        { type: 'string', optional: true, default: 'check' }
      },
      async handler(ctx) {
        const correlationId = ctx.id;
        const requestPath   = ctx.meta?.$requestUrl || '/v1/usernames/check';

        // Attach correlation ID to every response
        ctx.meta.$responseHeaders = {
          ...(ctx.meta.$responseHeaders || {}),
          'X-Correlation-ID': correlationId
        };

        // ── Input sanitization ───────────────────────────────────────────────
        const raw = sanitizeUsername(ctx.params.username);
        if (!raw) {
          ctx.meta.$statusCode  = 400;
          ctx.meta.$responseType = 'application/problem+json';
          return problemDetails(400, 'invalid-request', 'Invalid request',
            'username is required and must be a non-empty string', requestPath);
        }

        // ── Rate limit: IP-based check bucket ───────────────────────────────
        const ip = getClientIp(ctx);
        if (ip) {
          const rl = await ctx.call('rate-limiter.check', {
            bucket:     'check_ip',
            identifier: hashForLog(ip)
          }).catch(err => {
            this.logger.warn('[username-moderation] rate-limit check failed, failing open:', err.message);
            return { allowed: true, failOpen: true };
          });

          if (!rl.allowed) {
            const retryAfterSec = Math.ceil((rl.resetAt - Date.now()) / 1000);
            ctx.meta.$statusCode = 429;
            ctx.meta.$responseType = 'application/problem+json';
            ctx.meta.$responseHeaders['Retry-After'] = String(retryAfterSec);
            return problemDetails(429, 'rate-limit-exceeded', 'Too many requests',
              'Please wait before checking another username', requestPath);
          }
        }

        // ── Moderation pipeline ──────────────────────────────────────────────
        const result = checkUsername(raw);

        // ── Audit log (privacy-minimized) ────────────────────────────────────
        this.writeAuditLog({ correlationId, result, flow: ctx.params.flow || 'check', ip });

        // ── Async review queue for borderline cases ──────────────────────────
        if (result.decision === 'review') {
          ctx.call('username-review-worker.queueForReview', {
            result,
            flow:          ctx.params.flow || 'check',
            correlationId,
            ipHash:        ip ? hashForLog(ip) : undefined
          }).catch(err => {
            this.logger.warn('[username-moderation] failed to queue review:', err.message);
          });
        }

        // ── Build response ───────────────────────────────────────────────────
        const suggestions = result.decision !== 'allow' ? generateSuggestions(raw) : [];

        ctx.meta.$statusCode = 200;
        return {
          decision:    result.decision,
          reasons:     obfuscateReasons(result.reasons),
          scores: {
            fuzzyScore:         result.scores.fuzzyScore         ?? null,
            confusableDetected: result.scores.confusableDetected ?? false
          },
          artifacts: {
            normalized: result.artifacts.normalized,
            canonical:  result.artifacts.canonical
          },
          suggestions,
          correlationId,
          policyVersion: result.policyVersion
        };
      }
    },

    // ── Public HTTP endpoint: real-time availability ──────────────────────────
    /**
     * GET /v1/usernames/available?username=foo
     *
     * Runs the full moderation pipeline, then checks whether the username is
     * already registered in the database. Designed for debounced real-time
     * feedback during signup — results are advisory only; the backend enforces
     * all constraints on actual signup submission.
     *
     * Phase 1 review decisions are treated as available (allowed through at signup).
     *
     * Responses:
     *   200 { available, taken, decision, reasons, suggestions, correlationId, policyVersion }
     *   400 application/problem+json — malformed input
     *   429 application/problem+json — rate limited (shared check_ip bucket)
     *   500 application/problem+json — internal error
     *
     * Security:
     *   - Same check_ip rate-limit bucket as httpCheck (counts toward combined limit)
     *   - Cache-Control: no-store to prevent proxy/browser caching of availability state
     *   - Enumeration-resistant: blocked and taken both return available: false
     *     (distinguished only by the `taken` field to support targeted UX messaging)
     *   - usernameExists failure fails open (never blocks UX; backend is final arbiter)
     */
    httpAvailable: {
      // username arrives as a query string parameter for GET requests
      params: {
        username: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const correlationId = ctx.id;
        const requestPath   = ctx.meta?.$requestUrl || '/v1/usernames/available';

        ctx.meta.$responseHeaders = {
          ...(ctx.meta.$responseHeaders || {}),
          'X-Correlation-ID':  correlationId,
          'Cache-Control':     'no-store, no-cache, must-revalidate',
          'Pragma':            'no-cache'
        };

        // ── Input sanitization ───────────────────────────────────────────────
        const raw = sanitizeUsername(ctx.params.username);
        if (!raw) {
          ctx.meta.$statusCode   = 400;
          ctx.meta.$responseType = 'application/problem+json';
          return problemDetails(400, 'invalid-request', 'Invalid request',
            'username is required and must be a non-empty string', requestPath);
        }

        // ── Rate limit: shared check_ip bucket ───────────────────────────────
        const ip = getClientIp(ctx);
        if (ip) {
          const rl = await ctx.call('rate-limiter.check', {
            bucket:     'check_ip',
            identifier: hashForLog(ip)
          }).catch(err => {
            this.logger.warn('[username-moderation] availability rate-limit check failed, failing open:', err.message);
            return { allowed: true, failOpen: true };
          });

          if (!rl.allowed) {
            const retryAfterSec = Math.ceil((rl.resetAt - Date.now()) / 1000);
            ctx.meta.$statusCode = 429;
            ctx.meta.$responseType = 'application/problem+json';
            ctx.meta.$responseHeaders['Retry-After'] = String(retryAfterSec);
            return problemDetails(429, 'rate-limit-exceeded', 'Too many requests',
              'Please wait before checking another username', requestPath);
          }
        }

        // ── Moderation pipeline ──────────────────────────────────────────────
        const result = checkUsername(raw);

        // ── Audit log ────────────────────────────────────────────────────────
        this.writeAuditLog({ correlationId, result, flow: 'availability-check', ip });

        // ── Block: no availability check needed ──────────────────────────────
        if (result.decision === 'block') {
          const suggestions = generateSuggestions(raw);
          ctx.meta.$statusCode = 200;
          return {
            available:     false,
            taken:         false,
            decision:      result.decision,
            reasons:       obfuscateReasons(result.reasons),
            suggestions,
            correlationId,
            policyVersion: result.policyVersion
          };
        }

        // ── Review: Phase 1 policy — allowed through; no availability check ──
        if (result.decision === 'review') {
          ctx.meta.$statusCode = 200;
          return {
            available:     true,
            taken:         false,
            decision:      result.decision,
            reasons:       [],
            suggestions:   [],
            correlationId,
            policyVersion: result.policyVersion
          };
        }

        // ── Allow: check database availability ───────────────────────────────
        let taken = false;
        try {
          taken = await ctx.call('auth.account.usernameExists', { username: raw });
        } catch (err) {
          // Fail open: database check unavailable — backend will enforce at signup
          this.logger.warn('[username-moderation] usernameExists check failed, failing open:', err.message);
        }

        const suggestions = taken ? generateSuggestions(raw) : [];

        ctx.meta.$statusCode = 200;
        return {
          available:     !taken,
          taken,
          decision:      result.decision,
          reasons:       [],
          suggestions,
          correlationId,
          policyVersion: result.policyVersion
        };
      }
    },

    // ── Internal: assert safe — throws MoleculerClientError on block ─────────
    /**
     * Called from auth.js before.signup hook.
     * Performs rate limiting (signup buckets), moderation pipeline, audit, review queue.
     * Throws on block or rate-limit exceeded.
     * Allows through on review (Phase 1) with async queue.
     */
    assertSafe: {
      params: {
        username:  { type: 'string', min: 1, max: 200 },
        flow:      { type: 'string', optional: true, default: 'signup' },
        email:     { type: 'string', optional: true },
        ipAddress: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const correlationId = ctx.id;
        const { flow, email } = ctx.params;

        // ── Input sanitization ───────────────────────────────────────────────
        const raw = sanitizeUsername(ctx.params.username);
        if (!raw) {
          throw new MoleculerClientError(
            'Username is required and must be a valid string',
            400,
            'USERNAME_INVALID'
          );
        }

        // ── Rate limiting (signup-specific, tighter limits) ──────────────────
        const ip        = ctx.params.ipAddress ? sanitizeIp(ctx.params.ipAddress) : getClientIp(ctx);
        const rlItems   = [];

        if (ip)    rlItems.push({ bucket: 'signup_ip',    identifier: hashForLog(ip) });
        if (email) rlItems.push({ bucket: 'signup_email', identifier: hashForLog(email.toLowerCase().trim()) });

        if (rlItems.length > 0) {
          const rl = await ctx.call('rate-limiter.checkMulti', { items: rlItems }).catch(err => {
            this.logger.warn('[username-moderation] signup rate-limit check failed, failing open:', err.message);
            return { allowed: true, failOpen: true };
          });

          if (!rl.allowed) {
            const retryAfterMs = rl.resetAt - Date.now();
            throw new MoleculerClientError(
              'Too many signup attempts. Please try again later.',
              429,
              'RATE_LIMIT_EXCEEDED',
              { retryAfterMs: Math.max(0, retryAfterMs) }
            );
          }
        }

        // ── Moderation pipeline ──────────────────────────────────────────────
        const result = checkUsername(raw);

        // ── Audit log ────────────────────────────────────────────────────────
        this.writeAuditLog({ correlationId, result, flow, ip,
          emailHash: email ? hashForLog(email.toLowerCase().trim()) : undefined });

        // ── Decision handling ────────────────────────────────────────────────
        if (result.decision === 'block') {
          this.logger.warn('[username-moderation] signup blocked', {
            correlationId,
            normalizedHash: result.artifacts?.normalized ? hashForLog(result.artifacts.normalized) : null,
            reasons:        result.reasons,
            flow
          });

          const suggestions = generateSuggestions(raw);

          // Generic external message — does not reveal which term matched
          throw new MoleculerClientError(
            'This username is not available. Please choose a different username.',
            422,
            'USERNAME_NOT_ALLOWED',
            {
              reasons:      obfuscateReasons(result.reasons),
              suggestions,
              correlationId
            }
          );
        }

        if (result.decision === 'review') {
          this.logger.warn('[username-moderation] signup review-flagged', {
            correlationId,
            normalizedHash: result.artifacts?.normalized ? hashForLog(result.artifacts.normalized) : null,
            reasons:        result.reasons,
            flow
          });

          // Phase 1: allow through, queue for async moderator review
          ctx.call('username-review-worker.queueForReview', {
            result,
            flow,
            correlationId,
            ipHash:    ip    ? hashForLog(ip)    : undefined,
            emailHash: email ? hashForLog(email.toLowerCase().trim()) : undefined
          }).catch(err => {
            this.logger.warn('[username-moderation] failed to queue review job:', err.message);
          });
        }

        return result;
      }
    },

    // ── Internal: raw check (no side effects, no rate limiting) ─────────────
    check: {
      params: {
        username: { type: 'string', min: 1, max: 200 },
        flow:     { type: 'string', optional: true, default: 'check' }
      },
      handler(ctx) {
        const raw = sanitizeUsername(ctx.params.username);
        if (!raw) {
          return {
            decision: 'block',
            reasons:  ['invalid_input'],
            message:  'Username is invalid',
            scores:   {},
            artifacts: { raw: ctx.params.username, normalized: null, canonical: null, skeleton: null },
            policyVersion: POLICY_VERSION
          };
        }
        return checkUsername(raw);
      }
    },

    policyVersion: {
      handler() {
        return { version: POLICY_VERSION };
      }
    }
  },

  methods: {
    /**
     * Write a structured, privacy-minimized audit log entry.
     * Never logs raw usernames, emails, or IPs — only keyed HMAC tokens.
     */
    writeAuditLog({ correlationId, result, flow, ip, emailHash }) {
      this.logger.info('[username-moderation] audit', {
        correlationId,
        decision:           result.decision,
        reasons:            result.reasons,           // internal codes — not PII
        normalizedHash:     result.artifacts?.normalized ? hashForLog(result.artifacts.normalized) : null,
        canonicalHash:      result.artifacts?.canonical  ? hashForLog(result.artifacts.canonical)  : null,
        skeletonHash:       result.artifacts?.skeleton   ? hashForLog(result.artifacts.skeleton)   : null,
        ipHash:             ip        ? hashForLog(ip)        : null,
        emailHash:          emailHash || null,
        flow,
        policyVersion:      result.policyVersion,
        fuzzyScore:         result.scores?.fuzzyScore         ?? null,
        confusableDetected: result.scores?.confusableDetected ?? false,
        timestamp:          new Date().toISOString()
      });
    }
  }
};
