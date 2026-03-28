/**
 * Proof: backend internal identity projection API
 *
 * Verifies that the backend internal identity endpoints are:
 *   - loaded and reachable
 *   - authenticated (rejects wrong token)
 *   - returning a well-formed DTO
 *   - queryable by canonicalAccountId, DID, and handle
 */

'use strict';

const fetch = require('node-fetch');

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_ACCOUNT_CREATE_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_ATTEMPTS = 3;

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function env(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
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

async function request(url, token) {
  const maxAttempts = Number(process.env.PROOF_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS);
  const timeoutMs = Number(process.env.PROOF_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: timeoutMs
      });
      const body = await asJson(res);
      if (!res.ok && isRetryableStatus(res.status) && attempt < maxAttempts) {
        await sleep(computeBackoffMs(attempt));
        continue;
      }
      return { status: res.status, body };
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      await sleep(computeBackoffMs(attempt));
    }
  }

  throw lastError || new Error('Request failed');
}

async function createAccountWithRetries(base, password) {
  const maxAttempts = Number(process.env.PROOF_ACCOUNT_CREATE_ATTEMPTS || 5);
  const timeoutMs = Number(
    process.env.PROOF_ACCOUNT_CREATE_TIMEOUT_MS || DEFAULT_ACCOUNT_CREATE_TIMEOUT_MS
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const username = `u${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
    const payload = {
      username,
      email: `${username}@example.com`,
      password,
      profile: {
        displayName: username,
        summary: 'Identity projection proof'
      },
      solid: { enabled: true },
      activitypub: { enabled: true },
      atproto: {
        enabled: true,
        didMethod: 'plc'
      }
    };

    let createResponse;
    let createBody;

    try {
      createResponse = await fetch(`${base}/api/accounts/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: timeoutMs,
        body: JSON.stringify(payload)
      });
      createBody = await asJson(createResponse);
    } catch (error) {
      if (attempt < maxAttempts) {
        await sleep(computeBackoffMs(attempt));
        continue;
      }
      throw error;
    }

    if ((createResponse.status === 409 || isRetryableStatus(createResponse.status)) && attempt < maxAttempts) {
      await sleep(computeBackoffMs(attempt));
      continue;
    }

    assert(
      createResponse.status === 200 || createResponse.status === 201,
      `create account failed: ${createResponse.status} ${JSON.stringify(createBody)}`
    );

    return createBody;
  }

  throw new Error('Unable to create a unique unified account for projection proof');
}

(async () => {
  const base = env('BACKEND_BASE_URL', 'http://localhost:3000');
  const token = env('ACTIVITYPODS_TOKEN', 'test-atproto-signing-token-local');
  const password = process.env.UNIFIED_TEST_PASSWORD || 'Phase7LivePass123';
  const created = await createAccountWithRetries(base, password);
  const canonicalAccountId = created.canonicalAccountId;

  const byCanonical = await request(
    `${base}/api/internal/identity/by-canonical-account-id?canonicalAccountId=${encodeURIComponent(canonicalAccountId)}`,
    token
  );

  assert(
    byCanonical.status === 200,
    `by-canonical-account-id returned ${byCanonical.status}: ${JSON.stringify(byCanonical.body)}`
  );

  const projection = byCanonical.body;
  assert(projection && typeof projection === 'object', 'projection body is missing');
  assert(projection.canonicalAccountId, 'missing canonicalAccountId');
  assert(projection.webId, 'missing webId');
  assert(projection.atprotoDid, 'missing atprotoDid');
  assert(projection.atprotoHandle, 'missing atprotoHandle');
  assert(projection.atprotoSource === 'local', 'missing or invalid atprotoSource');
  assert(projection.atprotoManaged === true, 'missing or invalid atprotoManaged');
  assert(projection.atSigningKeyRef, 'missing atSigningKeyRef');
  assert(projection.atRotationKeyRef, 'missing atRotationKeyRef');
  assert(projection.status, 'missing status');
  assert(projection.repo && typeof projection.repo === 'object', 'missing repo block');
  assert(typeof projection.repo.initialized === 'boolean', 'repo.initialized must be boolean');

  const { atprotoDid: did, atprotoHandle: handle } = projection;

  const byDid = await request(
    `${base}/api/internal/identity/by-did?did=${encodeURIComponent(did)}`,
    token
  );
  assert(
    byDid.status === 200,
    `by-did returned ${byDid.status}: ${JSON.stringify(byDid.body)}`
  );

  const byHandle = await request(
    `${base}/api/internal/identity/by-handle?handle=${encodeURIComponent(handle)}`,
    token
  );
  assert(
    byHandle.status === 200,
    `by-handle returned ${byHandle.status}: ${JSON.stringify(byHandle.body)}`
  );

  const badAuthRes = await fetch(
    `${base}/api/internal/identity/by-canonical-account-id?canonicalAccountId=${encodeURIComponent(canonicalAccountId)}`,
    { headers: { Authorization: 'Bearer wrong-token' } }
  );
  const badAuthBody = await asJson(badAuthRes);
  assert(
    badAuthRes.status === 401,
    `bad auth should return 401, got ${badAuthRes.status}: ${JSON.stringify(badAuthBody)}`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: {
          byCanonicalStatus: byCanonical.status,
          byDidStatus: byDid.status,
          byHandleStatus: byHandle.status,
          badAuthStatus: badAuthRes.status
        },
        projection: {
          canonicalAccountId: projection.canonicalAccountId,
          webId: projection.webId,
          atprotoDid: projection.atprotoDid,
          atprotoHandle: projection.atprotoHandle,
          status: projection.status,
          repo: projection.repo
        }
      },
      null,
      2
    )
  );
})().catch(err => {
  console.error(
    JSON.stringify(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      null,
      2
    )
  );
  process.exit(1);
});
