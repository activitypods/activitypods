'use strict';

/**
 * Redis-backed sliding-window rate limiter.
 *
 * Algorithm: sliding window log using a Redis sorted set.
 *   ZADD  key epochMs randomMember
 *   ZREMRANGEBYSCORE key 0 (now - windowMs)
 *   ZCARD key                              → current count
 *   PEXPIRE key windowMs
 *
 * Properties:
 *   - Accurate to millisecond granularity (no fixed-window boundary bursts)
 *   - Atomic via MULTI/EXEC pipeline
 *   - Keys self-expire; no background cleanup needed
 *   - Fails open on Redis unavailability to avoid blocking signups during outages
 *
 * Buckets and limits:
 *   signup_ip     10 / IP  / hour
 *   signup_email   3 / email hash / day
 *   check_ip      30 / IP  / minute
 *   check_session 20 / session-id / minute
 *
 * Retry: exponential backoff with full jitter, max 2 retries, max delay 200ms.
 * Circuit breaker: opens after 5 consecutive Redis failures; probes after 30s.
 */

const Redis = require('ioredis');
const { retryWithBackoff, CircuitBreaker, CircuitOpenError } = require('../../utils/backoff');
const { sanitizeIp } = require('../../utils/sanitize');

// ─── Bucket definitions ───────────────────────────────────────────────────────
// windowSec: rolling window length in seconds
// max: maximum allowed requests in that window (inclusive)
const BUCKETS = {
  signup_ip: { windowSec: 3_600, max: 10 }, // 10 signups  / IP    / hour
  signup_email: { windowSec: 86_400, max: 3 }, // 3 signups   / email / day
  check_ip: { windowSec: 60, max: 30 }, // 30 checks   / IP    / minute
  check_session: { windowSec: 60, max: 20 } // 20 checks   / session / minute
};

// Backoff configuration for Redis pipeline retries
const REDIS_RETRY_OPTS = {
  maxRetries: 2,
  baseDelayMs: 25,
  maxDelayMs: 200,
  // Do not retry MOVED/CLUSTERDOWN — those need operator intervention
  retryIf: err => !err.message?.includes('MOVED') && !err.message?.includes('CLUSTERDOWN')
};

module.exports = {
  name: 'rate-limiter',

  settings: {
    redisUrl: process.env.SEMAPPS_REDIS_CACHE_URL || 'redis://localhost:6379',
    keyPrefix: 'ratelimit'
  },

  created() {
    this.redis = new Redis(this.settings.redisUrl, {
      // Prevent ioredis from retrying indefinitely on startup — let the circuit handle it
      maxRetriesPerRequest: 0,
      enableReadyCheck: false,
      lazyConnect: true
    });
    this.redis.on('error', err => {
      this.logger.warn('[rate-limiter] Redis error:', err.message);
    });

    this.breaker = new CircuitBreaker({
      name: 'rate-limiter-redis',
      failureThreshold: 5,
      resetTimeoutMs: 30_000
    });
  },

  async started() {
    try {
      await this.redis.connect();
    } catch (err) {
      this.logger.warn('[rate-limiter] Redis connect failed on startup (will retry on first use):', err.message);
    }
  },

  async stopped() {
    if (this.redis) {
      await this.redis.quit().catch(() => this.redis.disconnect());
    }
  },

  actions: {
    /**
     * Single-bucket sliding-window check + increment.
     *
     * @param {string} bucket     - One of the BUCKETS keys
     * @param {string} identifier - Already-hashed identifier (IP hash, email hash, etc.)
     * @returns {{ allowed: boolean, remaining: number, resetAt: number, failOpen?: boolean }}
     */
    check: {
      params: {
        bucket: { type: 'string', enum: Object.keys(BUCKETS) },
        identifier: { type: 'string', min: 1, max: 256 }
      },
      handler(ctx) {
        return this.slidingWindowCheck(ctx.params.bucket, ctx.params.identifier);
      }
    },

    /**
     * Check multiple buckets in parallel and return the most restrictive result.
     *
     * @param {{ bucket: string, identifier: string }[]} items
     */
    checkMulti: {
      params: {
        items: {
          type: 'array',
          min: 1,
          max: 5,
          items: {
            type: 'object',
            props: {
              bucket: { type: 'string', enum: Object.keys(BUCKETS) },
              identifier: { type: 'string', min: 1, max: 256 }
            }
          }
        }
      },
      async handler(ctx) {
        const results = await Promise.all(
          ctx.params.items.map(({ bucket, identifier }) => this.slidingWindowCheck(bucket, identifier))
        );
        // Return the first blocked result; if all allowed, return the tightest remaining count
        const blocked = results.find(r => !r.allowed);
        if (blocked) return blocked;
        return results.reduce((tightest, r) => (r.remaining < tightest.remaining ? r : tightest));
      }
    },

    /**
     * Delete all rate-limit records for a given bucket+identifier pair.
     * Use for testing or post-moderation resets only.
     */
    reset: {
      params: {
        bucket: { type: 'string', enum: Object.keys(BUCKETS) },
        identifier: { type: 'string', min: 1, max: 256 }
      },
      async handler(ctx) {
        const key = this.redisKey(ctx.params.bucket, ctx.params.identifier);
        await this.redis.del(key);
        return { reset: true, key };
      }
    }
  },

  methods: {
    redisKey(bucket, identifier) {
      // Identifier is already a hash (never contains raw PII)
      return `${this.settings.keyPrefix}:${bucket}:${identifier}`;
    },

    async slidingWindowCheck(bucket, identifier) {
      const window = BUCKETS[bucket];
      if (!window) throw new Error(`Unknown rate-limit bucket: ${bucket}`);

      const key = this.redisKey(bucket, identifier);
      const nowMs = Date.now();
      const windowMs = window.windowSec * 1_000;
      const cutoffMs = nowMs - windowMs;
      // Unique member: timestamp + random suffix to handle concurrent requests from the same ms
      const member = `${nowMs}:${Math.random().toString(36).slice(2, 8)}`;

      // Fail open when circuit is OPEN — do not block the user flow
      if (this.breaker.isOpen()) {
        this.logger.warn('[rate-limiter] circuit OPEN — failing open', { bucket });
        return this.failOpen(nowMs, windowMs);
      }

      try {
        const results = await retryWithBackoff(async () => {
          const pipe = this.redis.multi();
          pipe.zadd(key, nowMs, member); // add current request
          pipe.zremrangebyscore(key, 0, cutoffMs); // evict expired entries
          pipe.zcard(key); // count active entries
          pipe.pexpire(key, windowMs); // auto-expire the key
          return pipe.exec();
        }, REDIS_RETRY_OPTS);

        this.breaker._onSuccess();

        // results[i] = [err, value]; we want the ZCARD (index 2)
        const pipelineErr = results.find(([err]) => err != null);
        if (pipelineErr) throw pipelineErr[0];

        const count = results[2][1]; // ZCARD result
        const allowed = count <= window.max;
        const remaining = Math.max(0, window.max - count);
        const resetAt = nowMs + windowMs;

        return { allowed, remaining, resetAt };
      } catch (err) {
        if (err instanceof CircuitOpenError) {
          return this.failOpen(nowMs, windowMs);
        }
        // Record the failure in the circuit breaker and fail open
        this.breaker._onFailure();
        this.logger.error('[rate-limiter] Redis error, failing open:', { bucket, message: err.message });
        return this.failOpen(nowMs, windowMs);
      }
    },

    /** Build a "fail open" result — allows the request through when Redis is unavailable. */
    failOpen(nowMs, windowMs) {
      return { allowed: true, remaining: 1, resetAt: nowMs + windowMs, failOpen: true };
    }
  }
};
