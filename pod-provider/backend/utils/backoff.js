'use strict';

/**
 * Exponential backoff with full jitter + lightweight circuit breaker.
 *
 * Backoff strategy: "Full Jitter"
 *   sleep = random(0, min(cap, base * 2^attempt))
 *   Reference: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
 *
 * Circuit breaker: three-state finite automaton
 *   CLOSED    → normal operation
 *   OPEN      → fast-fail after failureThreshold consecutive failures
 *   HALF_OPEN → probe after resetTimeoutMs; success closes, failure re-opens
 */

const DEFAULT_BASE_DELAY_MS = 50;
const DEFAULT_MAX_DELAY_MS = 2000;
const DEFAULT_MAX_RETRIES = 3;

// ─── Backoff ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Full jitter delay for the given attempt index.
 *
 * @param {number} attempt - Zero-based attempt index
 * @param {number} [base]  - Base delay in ms
 * @param {number} [cap]   - Maximum delay cap in ms
 * @returns {number} Delay in ms
 */
function jitteredDelay(attempt, base = DEFAULT_BASE_DELAY_MS, cap = DEFAULT_MAX_DELAY_MS) {
  const exponential = Math.min(cap, base * Math.pow(2, attempt));
  return Math.floor(Math.random() * exponential);
}

/**
 * Execute an async function with exponential backoff and full jitter.
 *
 * @template T
 * @param {() => Promise<T>} fn - The operation to retry
 * @param {object}  [opts]
 * @param {number}  [opts.maxRetries=3]             - Maximum retry attempts (0 = no retries)
 * @param {number}  [opts.baseDelayMs=50]            - Base delay for backoff calculation
 * @param {number}  [opts.maxDelayMs=2000]           - Upper cap on any single delay
 * @param {number}  [opts.deadlineMs]                - Hard deadline from now; aborts if exceeded
 * @param {(e: Error) => boolean} [opts.retryIf]    - Return false to stop retrying immediately
 * @returns {Promise<T>}
 */
async function retryWithBackoff(fn, opts = {}) {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = opts.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const retryIf = opts.retryIf ?? (() => true);
  const deadlineMs = opts.deadlineMs != null ? Date.now() + opts.deadlineMs : Infinity;

  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (Date.now() > deadlineMs) {
      const deadlineError = new DeadlineExceededError('Retry deadline exceeded');
      deadlineError.cause = lastErr;
      throw deadlineError;
    }
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isLast = attempt === maxRetries;
      const shouldStop = !retryIf(err);
      if (isLast || shouldStop) throw err;
      const delay = jitteredDelay(attempt, baseDelayMs, maxDelayMs);
      await sleep(delay);
    }
  }
  throw lastErr; // unreachable, but keeps the type checker happy
}

// ─── Circuit breaker ─────────────────────────────────────────────────────────

const CB_STATE = Object.freeze({ CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' });

class CircuitBreaker {
  /**
   * @param {object} [opts]
   * @param {number} [opts.failureThreshold=5]  - Consecutive failures before opening
   * @param {number} [opts.resetTimeoutMs=30000] - Time in OPEN state before probing
   * @param {string} [opts.name='circuit']       - Identifier for logging
   */
  constructor(opts = {}) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 30_000;
    this.name = opts.name ?? 'circuit';
    this._state = CB_STATE.CLOSED;
    this._failures = 0;
    this._openedAt = null;
  }

  get state() {
    return this._state;
  }

  /** Returns true if the circuit is OPEN and the reset timeout has not elapsed. */
  isOpen() {
    if (this._state === CB_STATE.OPEN) {
      if (Date.now() - this._openedAt >= this.resetTimeoutMs) {
        this._state = CB_STATE.HALF_OPEN; // allow one probe
        return false;
      }
      return true;
    }
    return false;
  }

  _onSuccess() {
    this._failures = 0;
    this._state = CB_STATE.CLOSED;
  }

  _onFailure() {
    this._failures++;
    if (this._state === CB_STATE.HALF_OPEN || this._failures >= this.failureThreshold) {
      this._state = CB_STATE.OPEN;
      this._openedAt = Date.now();
    }
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitOpenError immediately when the circuit is OPEN.
   *
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  async execute(fn) {
    if (this.isOpen()) {
      throw new CircuitOpenError(`Circuit breaker '${this.name}' is OPEN — dependency unavailable`);
    }
    try {
      const result = await fn();
      this._onSuccess();
      return result;
    } catch (err) {
      if (err instanceof CircuitOpenError) throw err; // don't double-count
      this._onFailure();
      throw err;
    }
  }
}

// ─── Custom error types ───────────────────────────────────────────────────────

class CircuitOpenError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

class DeadlineExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DeadlineExceededError';
  }
}

module.exports = {
  retryWithBackoff,
  jitteredDelay,
  CircuitBreaker,
  CircuitOpenError,
  DeadlineExceededError,
  CB_STATE
};
