'use strict';

const fetch = require('node-fetch');

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_PASSWORD = 'Phase7LivePass123';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_ACCOUNT_CREATE_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_POLL_ATTEMPTS = 8;

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
      const response = await fetch(url, { ...options, timeout: timeoutMs });
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
        summary: 'Identity changes proof'
      },
      solid: { enabled: true },
      activitypub: { enabled: true },
      atproto: {
        enabled: true,
        didMethod: 'plc'
      }
    };

    let response;
    let body;

    try {
      response = await fetch(`${base}/api/accounts/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: timeoutMs,
        body: JSON.stringify(payload)
      });
      body = await asJson(response);
    } catch (error) {
      if (attempt < maxAttempts) {
        await sleep(computeBackoffMs(attempt));
        continue;
      }
      throw error;
    }

    if ((response.status === 409 || isRetryableStatus(response.status)) && attempt < maxAttempts) {
      await sleep(computeBackoffMs(attempt));
      continue;
    }

    assert(
      response.status === 200 || response.status === 201,
      `create account failed: ${response.status} ${JSON.stringify(body)}`
    );

    return body;
  }

  throw new Error('Unable to create a unique unified account for changes proof');
}

async function getChanges(base, token, { since = null, limit = 100 } = {}) {
  const query = new URLSearchParams();
  query.set('limit', String(limit));
  if (since) {
    query.set('since', since);
  }

  return fetchJsonWithRetry(`${base}/api/internal/identity/changes?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

async function drainChangesFeed(base, token, limit) {
  let cursor = null;

  for (;;) {
    const { response, body } = await getChanges(base, token, { since: cursor, limit });
    assert(response.status === 200, `changes feed returned ${response.status}: ${JSON.stringify(body)}`);
    assert(Array.isArray(body.items), 'changes feed items must be an array');

    const nextCursor = typeof body.nextCursor === 'string' || body.nextCursor === null
      ? body.nextCursor
      : cursor;

    if (body.items.length === 0 || nextCursor === cursor) {
      return cursor;
    }

    cursor = nextCursor;

    if (body.items.length < limit) {
      return cursor;
    }
  }
}

(async () => {
  const base = env('BACKEND_BASE_URL', DEFAULT_BASE_URL).replace(/\/$/, '');
  const token = env('ACTIVITYPODS_TOKEN', 'test-atproto-signing-token-local');
  const password = process.env.UNIFIED_TEST_PASSWORD || DEFAULT_PASSWORD;
  const limit = Math.max(10, Math.min(Number(process.env.IDENTITY_CHANGES_BATCH_LIMIT) || 100, 500));

  const cursorBefore = await drainChangesFeed(base, token, limit);
  const createBody = await createAccountWithRetries(base, password);
  assert(createBody.canonicalAccountId, 'missing canonicalAccountId from create response');

  let matchedItem = null;
  let nextCursor = cursorBefore;

  for (let attempt = 1; attempt <= DEFAULT_POLL_ATTEMPTS; attempt += 1) {
    const { response, body } = await getChanges(base, token, {
      since: nextCursor,
      limit
    });

    assert(response.status === 200, `changes feed returned ${response.status}: ${JSON.stringify(body)}`);
    assert(Array.isArray(body.items), 'changes feed items must be an array');

    matchedItem = body.items.find(item => item.canonicalAccountId === createBody.canonicalAccountId) || null;
    nextCursor = typeof body.nextCursor === 'string' || body.nextCursor === null
      ? body.nextCursor
      : nextCursor;

    if (matchedItem) break;

    await sleep(computeBackoffMs(attempt));
  }

  assert(matchedItem, 'newly created account did not appear in identity changes feed');
  assert(matchedItem.atprotoDid, 'changes item missing atprotoDid');
  assert(matchedItem.atprotoHandle, 'changes item missing atprotoHandle');
  assert(matchedItem.atprotoSource === 'local', 'changes item missing atprotoSource');
  assert(matchedItem.atprotoManaged === true, 'changes item missing atprotoManaged');
  assert(matchedItem.repo && matchedItem.repo.initialized === true, 'changes item missing repo.initialized');
  assert(matchedItem.repo.rootCid, 'changes item missing repo.rootCid');
  assert(matchedItem.repo.rev, 'changes item missing repo.rev');

  const badAuthRes = await fetch(
    `${base}/api/internal/identity/changes?limit=1`,
    { headers: { Authorization: 'Bearer wrong-token' }, timeout: DEFAULT_TIMEOUT_MS }
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
        cursorBefore,
        nextCursor,
        matchedItem: {
          canonicalAccountId: matchedItem.canonicalAccountId,
          atprotoDid: matchedItem.atprotoDid,
          atprotoHandle: matchedItem.atprotoHandle,
          repo: matchedItem.repo
        },
        checks: {
          badAuthStatus: badAuthRes.status
        }
      },
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
