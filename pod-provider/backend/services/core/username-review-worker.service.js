'use strict';

/**
 * Async review worker for borderline username decisions.
 *
 * Phase 1: structured logging only — all review-flagged usernames are recorded.
 * Phase 3: this service will push to a moderator queue UI with full CRUD tooling.
 *
 * Uses moleculer-bull for reliable async processing with:
 *   - 3 retry attempts
 *   - Exponential backoff between attempts (500ms, 1s, 2s)
 *   - Dead-letter queue (DLQ) for permanently failed jobs (kept for 50 entries)
 *   - Completed job retention of 100 entries for operational visibility
 */

const QueueService = require('moleculer-bull');
const CONFIG = require('../../config/config');
const { hashForLog } = require('../../utils/log-privacy');

const QUEUE_NAME = 'username.review';

module.exports = {
  name: 'username-review-worker',

  // QueueService returns undefined/no-op mixin when CONFIG.QUEUE_SERVICE_URL is unset
  mixins: [QueueService(CONFIG.QUEUE_SERVICE_URL)],

  settings: {
    queues: {
      [QUEUE_NAME]: {
        // Processing options passed to Bull
        concurrency: 4
      }
    }
  },

  queues: {
    [QUEUE_NAME]: {
      concurrency: 4,
      async process(job) {
        const {
          normalizedHash,
          canonicalHash,
          skeletonHash,
          ipHash,
          emailHash,
          reasons,
          scores,
          correlationId,
          flow,
          policyVersion,
          enqueuedAt
        } = job.data;

        // Phase 1: structured audit log entry
        // Phase 3: persist to a moderation_review table and notify moderators
        this.logger.info('[username-review-worker] borderline username queued for review', {
          jobId: job.id,
          correlationId,
          normalizedHash,
          canonicalHash,
          skeletonHash: skeletonHash || null,
          ipHash: ipHash || null,
          emailHash: emailHash || null,
          reasons,
          fuzzyScore: scores?.fuzzyScore ?? null,
          confusable: scores?.confusableDetected ?? false,
          flow,
          policyVersion,
          enqueuedAt,
          processedAt: new Date().toISOString()
        });

        return { processed: true, correlationId, jobId: job.id };
      }
    }
  },

  actions: {
    /**
     * Enqueue a borderline result for async moderator review.
     *
     * @param {object} result         - Result from checkUsername
     * @param {string} [flow]         - signup | rename | admin_rename
     * @param {string} [correlationId]
     * @param {string} [ipHash]       - Pre-hashed IP (never raw)
     * @param {string} [emailHash]    - Pre-hashed email (never raw)
     */
    queueForReview: {
      params: {
        result: { type: 'object' },
        flow: { type: 'string', optional: true, default: 'signup' },
        correlationId: { type: 'string', optional: true },
        ipHash: { type: 'string', optional: true },
        emailHash: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const { result, flow, correlationId, ipHash, emailHash } = ctx.params;

        if (!this.createJob) {
          // Queue not available (QUEUE_SERVICE_URL unset) — fall back to inline log
          this.logger.info('[username-review-worker] queue unavailable, logging inline', {
            correlationId,
            normalizedHash: result.artifacts?.normalized ? hashForLog(result.artifacts.normalized) : null,
            reasons: result.reasons,
            flow
          });
          return { queued: false, reason: 'queue_unavailable' };
        }

        const jobPayload = {
          normalizedHash: result.artifacts?.normalized ? hashForLog(result.artifacts.normalized) : null,
          canonicalHash: result.artifacts?.canonical ? hashForLog(result.artifacts.canonical) : null,
          skeletonHash: result.artifacts?.skeleton ? hashForLog(result.artifacts.skeleton) : null,
          ipHash: ipHash || null,
          emailHash: emailHash || null,
          reasons: result.reasons,
          scores: {
            fuzzyScore: result.scores?.fuzzyScore ?? null,
            fuzzyMatchedTerm: result.scores?.fuzzyMatchedTerm ?? null, // term, not PII
            confusableDetected: result.scores?.confusableDetected ?? false
          },
          correlationId: correlationId || null,
          flow,
          policyVersion: result.policyVersion,
          enqueuedAt: new Date().toISOString()
        };

        await this.createJob(QUEUE_NAME, jobPayload, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 500 }, // 500ms → 1s → 2s
          removeOnComplete: 100, // keep last 100 completed for observability
          removeOnFail: 50 // DLQ — keep last 50 failures for investigation
        });

        return { queued: true };
      }
    }
  }
};
