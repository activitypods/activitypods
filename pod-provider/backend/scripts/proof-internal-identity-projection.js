/**
 * Proof: backend internal identity projection API
 *
 * Verifies that the backend internal identity endpoints are:
 *   - loaded and reachable
 *   - authenticated (rejects wrong token)
 *   - returning a well-formed DTO
 *   - queryable by canonicalAccountId, DID, and handle
 *
 * Usage:
 *   IDENTITY_PROJECTION_CANONICAL_ACCOUNT_ID=http://localhost:3000/alice \
 *   node scripts/proof-internal-identity-projection.js
 *
 * Or via npm:
 *   npm run proof:identity-projection
 */

'use strict';

async function asJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

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

async function request(url, token) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return { status: res.status, body: await asJson(res) };
}

(async () => {
  const base = env('BACKEND_BASE_URL', 'http://localhost:3000');
  const token = env('ACTIVITYPODS_TOKEN', 'test-atproto-signing-token-local');
  const canonicalAccountId = env(
    'IDENTITY_PROJECTION_CANONICAL_ACCOUNT_ID',
    'http://localhost:3000/atproto365133'
  );

  // ---- 1. by-canonical-account-id ----------------------------------------
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
  assert(projection.atSigningKeyRef, 'missing atSigningKeyRef');
  assert(projection.atRotationKeyRef, 'missing atRotationKeyRef');
  assert(projection.status, 'missing status');

  const { atprotoDid: did, atprotoHandle: handle } = projection;

  // ---- 2. by-did -----------------------------------------------------------
  const byDid = await request(
    `${base}/api/internal/identity/by-did?did=${encodeURIComponent(did)}`,
    token
  );
  assert(
    byDid.status === 200,
    `by-did returned ${byDid.status}: ${JSON.stringify(byDid.body)}`
  );

  // ---- 3. by-handle --------------------------------------------------------
  const byHandle = await request(
    `${base}/api/internal/identity/by-handle?handle=${encodeURIComponent(handle)}`,
    token
  );
  assert(
    byHandle.status === 200,
    `by-handle returned ${byHandle.status}: ${JSON.stringify(byHandle.body)}`
  );

  // ---- 4. Negative auth check ---------------------------------------------
  const badAuthRes = await fetch(
    `${base}/api/internal/identity/by-canonical-account-id?canonicalAccountId=${encodeURIComponent(canonicalAccountId)}`,
    { headers: { Authorization: 'Bearer wrong-token' } }
  );
  const badAuthBody = await asJson(badAuthRes);
  assert(
    badAuthRes.status === 401,
    `bad auth should return 401, got ${badAuthRes.status}: ${JSON.stringify(badAuthBody)}`
  );

  // ---- Report --------------------------------------------------------------
  const report = {
    ok: true,
    checks: {
      byCanonicalStatus: byCanonical.status,
      byDidStatus: byDid.status,
      byHandleStatus: byHandle.status,
      badAuthStatus: badAuthRes.status,
    },
    projection: {
      canonicalAccountId: projection.canonicalAccountId,
      webId: projection.webId,
      atprotoDid: projection.atprotoDid,
      atprotoHandle: projection.atprotoHandle,
      status: projection.status,
    },
  };

  console.log(JSON.stringify(report, null, 2));
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
