'use strict';

const fetch = require('node-fetch');

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_ATTEMPTS = 3;

function env(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing env ${name}`);
  }
  return value;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function computeBackoffMs(attempt) {
  const base = 250 * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * 200);
  return Math.min(base + jitter, 2_500);
}

async function asJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function fetchJsonWithRetry(url, options = {}) {
  const maxAttempts = Number(process.env.PROOF_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS);
  const timeoutMs = Number(options.timeout || process.env.PROOF_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        timeout: timeoutMs
      });
      const body = await asJson(response);

      if (!response.ok && isRetryableStatus(response.status) && attempt < maxAttempts) {
        await sleep(computeBackoffMs(attempt));
        continue;
      }

      return { response, body };
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      await sleep(computeBackoffMs(attempt));
    }
  }

  throw lastError || new Error('Request failed');
}

function sanitizeForLogs(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(item => sanitizeForLogs(item));
  if (typeof value !== 'object') return value;

  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      key.toLowerCase().includes('key') ||
      key.toLowerCase().includes('secret') ||
      key.toLowerCase().includes('token')
    ) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = sanitizeForLogs(item);
    }
  }
  return out;
}

(async () => {
  const base = env('BACKEND_BASE_URL', DEFAULT_BASE_URL).replace(/\/$/, '');
  const token = env('ACTIVITYPODS_TOKEN', 'test-atproto-signing-token-local');
  const canonicalAccountId = env(
    'ATPROTO_LEGACY_CANONICAL_ACCOUNT_ID',
    'http://localhost:3000/atproto365133'
  );
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'X-Request-Id': `repair-proof-${Date.now()}`
  };

  const before = await fetchJsonWithRetry(
    `${base}/api/internal/identity/by-canonical-account-id?canonicalAccountId=${encodeURIComponent(canonicalAccountId)}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  assert(before.response.status === 200, `projection before repair failed: ${before.response.status}`);

  const dryRun = await fetchJsonWithRetry(
    `${base}/api/internal/atproto/repair?canonicalAccountId=${encodeURIComponent(canonicalAccountId)}&dryRun=true`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  assert(dryRun.response.status === 200, `dry-run repair failed: ${dryRun.response.status}`);

  const repair = await fetchJsonWithRetry(`${base}/api/internal/atproto/repair`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      canonicalAccountId,
      dryRun: false
    })
  });
  assert(repair.response.status === 200, `repair failed: ${repair.response.status}`);

  const after = await fetchJsonWithRetry(
    `${base}/api/internal/identity/by-canonical-account-id?canonicalAccountId=${encodeURIComponent(canonicalAccountId)}`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  );
  assert(after.response.status === 200, `projection after repair failed: ${after.response.status}`);
  assert(after.body.repo, 'projection after repair missing repo block');
  assert(after.body.repo.initialized === true, 'repo.initialized should be true after repair');
  assert(after.body.repo.rootCid, 'repo.rootCid should be present after repair');
  assert(after.body.repo.rev, 'repo.rev should be present after repair');

  const backfillDryRun = await fetchJsonWithRetry(`${base}/api/internal/atproto/repair/backfill`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      dryRun: true,
      limit: 10
    })
  });
  assert(
    backfillDryRun.response.status === 200,
    `bulk backfill dry-run failed: ${backfillDryRun.response.status}`
  );

  const badAuthRes = await fetch(`${base}/api/internal/atproto/repair?canonicalAccountId=${encodeURIComponent(canonicalAccountId)}&dryRun=true`, {
    headers: { Authorization: 'Bearer wrong-token' },
    timeout: DEFAULT_TIMEOUT_MS
  });
  const badAuthBody = await asJson(badAuthRes);
  assert(badAuthRes.status === 401, `bad auth should return 401, got ${badAuthRes.status}`);

  console.log(
    JSON.stringify(
      sanitizeForLogs({
        ok: true,
        canonicalAccountId,
        before: before.body.repo || null,
        dryRun: dryRun.body,
        repair: repair.body,
        after: after.body.repo,
        backfillDryRun: {
          dryRun: backfillDryRun.body.dryRun,
          examined: backfillDryRun.body.examined,
          repairable: backfillDryRun.body.repairable,
          repaired: backfillDryRun.body.repaired,
          nextCursor: backfillDryRun.body.nextCursor
        },
        checks: {
          badAuthStatus: badAuthRes.status,
          badAuthBody
        }
      }),
      null,
      2
    )
  );
})().catch(error => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      },
      null,
      2
    )
  );
  process.exit(1);
});
