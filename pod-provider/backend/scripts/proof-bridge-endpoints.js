/**
 * Proof: Internal bridge endpoint contracts
 *
 * Verifies both bridge endpoints are:
 *   - Loaded and reachable
 *   - Authenticated (rejects missing / wrong tokens with 401)
 *   - Contract-correct (field validation, idempotency, response shape)
 *
 * Usage:
 *   ACTIVITYPODS_TOKEN=<token> node proof-bridge-endpoints.js
 *
 * Optional env overrides:
 *   BACKEND_BASE_URL    default http://localhost:3000
 *   PROOF_TIMEOUT_MS    default 10000
 *   PROOF_MAX_ATTEMPTS  default 3
 */

'use strict';

const fetch = require('node-fetch');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;

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

/** Exponential backoff with jitter. Returns milliseconds. */
function computeBackoffMs(attempt) {
  const base = 250 * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * 200);
  return Math.min(base + jitter, 4_000);
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function parseBody(res) {
  const text = await res.text().catch(() => '');
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text };
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function httpPost(url, token, body, retryOn5xx = true) {
  const maxAttempts = Number(process.env.PROOF_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS);
  const timeoutMs = Number(process.env.PROOF_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body),
        timeout: timeoutMs
      });

      const responseBody = await parseBody(res);

      if (retryOn5xx && isRetryableStatus(res.status) && attempt < maxAttempts) {
        await sleep(computeBackoffMs(attempt));
        continue;
      }

      return { status: res.status, body: responseBody };
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(computeBackoffMs(attempt));
        continue;
      }
    }
  }

  throw lastError || new Error(`POST ${url} failed after ${maxAttempts} attempts`);
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`  ✓ ${name}`);
  passed++;
}

function fail(name, detail) {
  console.error(`  ✗ ${name}`);
  if (detail) console.error(`    → ${detail}`);
  failed++;
}

function assert(condition, name, detail) {
  if (condition) {
    pass(name);
  } else {
    fail(name, detail || 'condition was false');
  }
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

async function testResolveOutbound(base, token) {
  console.log('\n── POST /api/internal/activitypub-bridge/resolve-outbound ──');
  const url = `${base}/api/internal/activitypub-bridge/resolve-outbound`;

  // 1. Reject with no auth
  {
    const r = await httpPost(url, null, {}, false);
    assert(r.status === 401, 'no auth → 401', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 2. Reject with wrong token
  {
    const r = await httpPost(url, 'wrong-token-value', {}, false);
    assert(r.status === 401, 'wrong token → 401', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 3. Reject missing actorUri
  {
    const r = await httpPost(url, token, { activity: { type: 'Create' } });
    assert(r.status === 400, 'missing actorUri → 400', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 4. Reject invalid actorUri URL
  {
    const r = await httpPost(url, token, {
      actorUri: 'not-a-url',
      activity: { type: 'Create' }
    });
    assert(r.status === 400, 'invalid actorUri URL → 400', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 5. Reject non-http actorUri protocol
  {
    const r = await httpPost(url, token, {
      actorUri: 'ftp://example.com/actor',
      activity: { type: 'Create' }
    });
    assert(r.status === 400, 'ftp:// actorUri → 400', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 6. Reject missing activity
  {
    const r = await httpPost(url, token, { actorUri: 'https://example.com/actor' });
    assert(r.status === 400, 'missing activity → 400', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 7. Valid request — local actor, empty recipients → 200 with correct shape
  {
    const r = await httpPost(url, token, {
      actorUri: 'http://localhost:3000/testdev-local',
      activity: {
        type: 'Create',
        to: [],
        cc: []
      }
    });
    assert(r.status === 200, 'valid empty activity → 200', `got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(
      r.body && typeof r.body.actorUri === 'string',
      'response has actorUri string',
      `body: ${JSON.stringify(r.body)}`
    );
    assert(Array.isArray(r.body.deliveries), 'response has deliveries array', `body: ${JSON.stringify(r.body)}`);
    assert(typeof r.body.resolvedAt === 'string', 'response has resolvedAt string', `body: ${JSON.stringify(r.body)}`);
  }

  // 8. Reject non-http recipient URIs (they should be filtered, not cause 400)
  {
    const r = await httpPost(url, token, {
      actorUri: 'http://localhost:3000/testdev-local',
      activity: {
        type: 'Create',
        to: ['as:Public', 'invalid-uri']
      }
    });
    assert(r.status === 200, 'non-http recipients are filtered → 200', `got ${r.status}`);
    assert(Array.isArray(r.body.deliveries) && r.body.deliveries.length === 0, 'filtered to empty deliveries');
  }
}

async function testCanonicalNotification(base, token) {
  console.log('\n── POST /api/internal/bridge/canonical-notification ──');
  const url = `${base}/api/internal/bridge/canonical-notification`;

  // Use a unique intent ID for each test run to avoid cross-run collisions
  const runId = `proof-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const basePayload = {
    canonicalIntentId: `${runId}-follow`,
    kind: 'FollowAdd',
    sourceProtocol: 'atproto',
    actor: {
      did: 'did:plc:proof-test-actor',
      handle: 'proof-test.bsky.social'
    },
    subject: {
      activityPubActorUri: 'http://localhost:3000/testdev-local'
    },
    createdAt: new Date().toISOString()
  };

  // 1. No auth → 401
  {
    const r = await httpPost(url, null, basePayload, false);
    assert(r.status === 401, 'no auth → 401', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 2. Wrong token → 401
  {
    const r = await httpPost(url, 'wrong-token', basePayload, false);
    assert(r.status === 401, 'wrong token → 401', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 3. Missing canonicalIntentId → 400
  {
    const r = await httpPost(url, token, { ...basePayload, canonicalIntentId: '' });
    assert(r.status === 400, 'missing canonicalIntentId → 400', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 4. Invalid kind → 400
  {
    const r = await httpPost(url, token, { ...basePayload, kind: 'NOT_A_VALID_KIND' });
    assert(r.status === 400, 'invalid kind → 400', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 5. Invalid sourceProtocol → 400
  {
    const r = await httpPost(url, token, { ...basePayload, sourceProtocol: 'matrix' });
    assert(r.status === 400, 'invalid sourceProtocol → 400', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 6. Missing actor → 400
  {
    const { actor: _actor, ...withoutActor } = basePayload;
    const r = await httpPost(url, token, withoutActor);
    assert(r.status === 400, 'missing actor → 400', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 7. Missing createdAt → 400
  {
    const r = await httpPost(url, token, { ...basePayload, createdAt: '' });
    assert(r.status === 400, 'missing createdAt → 400', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 8. Invalid createdAt → 400
  {
    const r = await httpPost(url, token, { ...basePayload, createdAt: 'not-a-date' });
    assert(r.status === 400, 'invalid createdAt → 400', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 9. Valid FollowAdd → 202 with correct shape
  {
    const r = await httpPost(url, token, basePayload);
    assert(r.status === 202, 'valid FollowAdd → 202', `got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body?.ok === true, 'response ok=true', `body: ${JSON.stringify(r.body)}`);
    assert(typeof r.body?.delivered === 'boolean', 'response has delivered boolean', `body: ${JSON.stringify(r.body)}`);
    assert(Array.isArray(r.body?.recipients), 'response has recipients array', `body: ${JSON.stringify(r.body)}`);
    assert(r.body?.duplicate === false, 'response duplicate=false on first call', `body: ${JSON.stringify(r.body)}`);
  }

  // 10. Idempotency — same canonicalIntentId → 409
  {
    const r = await httpPost(url, token, basePayload);
    assert(r.status === 409, 'duplicate canonicalIntentId → 409', `got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(r.body?.ok === true, 'idempotent response ok=true', `body: ${JSON.stringify(r.body)}`);
    assert(r.body?.duplicate === true, 'idempotent response duplicate=true', `body: ${JSON.stringify(r.body)}`);
  }

  // 11. Non-notification kind (PostDelete) — still 202 but no delivery attempted
  {
    const r = await httpPost(url, token, {
      ...basePayload,
      canonicalIntentId: `${runId}-delete`,
      kind: 'PostDelete',
      object: { canonicalObjectId: 'test-123', atUri: 'at://did:plc:test/app.bsky.feed.post/test-abc' }
    });
    assert(r.status === 202, 'non-notification kind (PostDelete) → 202', `got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(
      r.body?.reason === 'non-notification kind',
      'PostDelete returns reason=non-notification kind',
      `body: ${JSON.stringify(r.body)}`
    );
  }

  // 12. PostCreate with mentions
  {
    const r = await httpPost(url, token, {
      ...basePayload,
      canonicalIntentId: `${runId}-post`,
      kind: 'PostCreate',
      subject: undefined,
      mentions: ['http://localhost:3000/testdev-local'],
      actor: { did: 'did:plc:proof-postcreate', handle: 'postcreate.bsky.social' },
      object: {
        canonicalObjectId: 'post-001',
        atUri: 'at://did:plc:proof-postcreate/app.bsky.feed.post/postid123'
      },
      content: { text: 'Hello @testdev-local!' }
    });
    assert(r.status === 202, 'valid PostCreate with mentions → 202', `got ${r.status}: ${JSON.stringify(r.body)}`);
    assert(typeof r.body?.delivered === 'boolean', 'PostCreate response has delivered boolean');
  }

  // 13. ReactionAdd — post object owner lookup
  {
    const r = await httpPost(url, token, {
      ...basePayload,
      canonicalIntentId: `${runId}-like`,
      kind: 'ReactionAdd',
      subject: undefined,
      actor: { did: 'did:plc:proof-reactor', handle: 'reactor.bsky.social' },
      object: {
        canonicalObjectId: 'obj-001',
        // Use a non-existent local post — owner lookup will fail gracefully
        activityPubObjectId: 'http://localhost:3000/testdev-local/data/non-existent-post'
      }
    });
    assert(
      r.status === 202,
      'ReactionAdd with failed owner lookup → still 202',
      `got ${r.status}: ${JSON.stringify(r.body)}`
    );
  }
}

async function testResolveMedia(base, token) {
  console.log('\n── POST /api/internal/activitypub-bridge/resolve-media ──');
  const url = `${base}/api/internal/activitypub-bridge/resolve-media`;

  // 1. No auth → 401
  {
    const r = await httpPost(url, null, { mediaUrl: 'https://example.com/image.jpg' }, false);
    assert(r.status === 401, 'no auth → 401', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 2. Wrong token → 401
  {
    const r = await httpPost(url, 'wrong-token', { mediaUrl: 'https://example.com/image.jpg' }, false);
    assert(r.status === 401, 'wrong token → 401', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 3. Missing mediaUrl → 400
  {
    const r = await httpPost(url, token, {});
    assert(r.status === 400, 'missing mediaUrl → 400', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 4. Invalid mediaUrl (not a URL) → 400
  {
    const r = await httpPost(url, token, { mediaUrl: 'not-a-url' });
    assert(r.status === 400, 'non-URL mediaUrl → 400', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 5. Non-https/non-localhost http scheme → 400
  {
    const r = await httpPost(url, token, { mediaUrl: 'ftp://example.com/image.jpg' });
    assert(r.status === 400, 'ftp:// mediaUrl → 400', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 6. Valid https URL that does not exist → 404 or upstream error (not 401/500)
  {
    const r = await httpPost(url, token, { mediaUrl: 'https://example.invalid/nonexistent.jpg' });
    assert(
      r.status === 404 || r.status === 503 || r.status === 502,
      'non-existent https URL → 404|502|503',
      `got ${r.status}: ${JSON.stringify(r.body)}`
    );
    assert(typeof r.body?.error === 'string', 'error field is a string', `body: ${JSON.stringify(r.body)}`);
  }
}

async function testResolveProfileMedia(base, token) {
  console.log('\n── POST /api/internal/activitypub-bridge/resolve-profile-media ──');
  const url = `${base}/api/internal/activitypub-bridge/resolve-profile-media`;

  // 1. No auth → 401
  {
    const r = await httpPost(url, null, { mediaUrl: 'https://example.com/avatar.jpg' }, false);
    assert(r.status === 401, 'no auth → 401', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 2. Wrong token → 401
  {
    const r = await httpPost(url, 'wrong-token', { mediaUrl: 'https://example.com/avatar.jpg' }, false);
    assert(r.status === 401, 'wrong token → 401', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 3. Missing mediaUrl → 400
  {
    const r = await httpPost(url, token, {});
    assert(r.status === 400, 'missing mediaUrl → 400', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 4. Invalid mediaUrl → 400
  {
    const r = await httpPost(url, token, { mediaUrl: 'not-a-url' });
    assert(r.status === 400, 'non-URL mediaUrl → 400', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 5. ftp:// → 400
  {
    const r = await httpPost(url, token, { mediaUrl: 'ftp://example.com/avatar.jpg' });
    assert(r.status === 400, 'ftp:// mediaUrl → 400', `got ${r.status}: ${JSON.stringify(r.body)}`);
  }

  // 6. Valid https URL that does not exist → upstream error
  {
    const r = await httpPost(url, token, { mediaUrl: 'https://example.invalid/nonexistent.jpg' });
    assert(
      r.status === 404 || r.status === 503 || r.status === 502,
      'non-existent https URL → 404|502|503',
      `got ${r.status}: ${JSON.stringify(r.body)}`
    );
    assert(typeof r.body?.error === 'string', 'error field is a string', `body: ${JSON.stringify(r.body)}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

(async () => {
  const base = env('BACKEND_BASE_URL', 'http://localhost:3000');
  const token = env('ACTIVITYPODS_TOKEN', 'test-atproto-signing-token-local');

  console.log(`\nBridge Endpoint Proof  [${base}]`);
  console.log('='.repeat(60));

  try {
    await testResolveOutbound(base, token);
    await testCanonicalNotification(base, token);
    await testResolveMedia(base, token);
    await testResolveProfileMedia(base, token);
  } catch (err) {
    console.error('\nFATAL:', err.message);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('All bridge endpoint contracts verified ✓');
  }
})();
