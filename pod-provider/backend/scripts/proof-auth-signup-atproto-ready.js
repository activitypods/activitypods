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

function uniqueUsername() {
  const rand = Math.random().toString(36).slice(2, 9);
  return `u${Date.now()}${rand}`;
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

async function requestProjectionWithRetry(base, token, canonicalAccountId) {
  const maxAttempts = Number(process.env.PROOF_MAX_ATTEMPTS || DEFAULT_MAX_ATTEMPTS);
  const timeoutMs = Number(process.env.PROOF_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch(
      `${base}/api/internal/identity/by-canonical-account-id?canonicalAccountId=${encodeURIComponent(canonicalAccountId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: timeoutMs
      }
    );
    const body = await asJson(response);

    if (response.status === 200) {
      return body;
    }

    if (isRetryableStatus(response.status) && attempt < maxAttempts) {
      await sleep(computeBackoffMs(attempt));
      continue;
    }

    throw new Error(`projection lookup failed: ${response.status} ${JSON.stringify(body)}`);
  }

  throw new Error('projection lookup failed after retries');
}

async function requestActor(actorUri) {
  const response = await fetch(actorUri, {
    headers: { Accept: 'application/activity+json, application/ld+json, application/json' },
    timeout: Number(process.env.PROOF_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
  });
  const body = await asJson(response);
  assert(response.status === 200, `actor lookup failed: ${response.status} ${JSON.stringify(body)}`);
  return body;
}

function expectedAtprotoHandle(username) {
  const explicit = String(process.env.SIGNUP_ATPROTO_HANDLE || '')
    .trim()
    .toLowerCase();
  if (explicit) return explicit;
  const domain = String(process.env.APODS_ATPROTO_HANDLE_DOMAIN || '')
    .trim()
    .toLowerCase()
    .replace(/^\.+|\.+$/g, '');
  const label = String(username || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `${label}.${domain || 'test'}`;
}

(async () => {
  const base = env('BACKEND_BASE_URL', DEFAULT_BASE_URL).replace(/\/$/, '');
  const token = env('ACTIVITYPODS_TOKEN', 'test-atproto-signing-token-local');
  const password = env('SIGNUP_PASSWORD', 'Phase7LivePass123');

  const username = process.env.SIGNUP_USERNAME || uniqueUsername();
  const email = process.env.SIGNUP_EMAIL || `${username}@example.com`;
  const normalizedUsername = username.trim().toLowerCase();

  const signupResponse = await fetch(`${base}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeout: Number(process.env.PROOF_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    body: JSON.stringify({ username, email, password })
  });
  const signupBody = await asJson(signupResponse);

  assert(
    signupResponse.status === 200 || signupResponse.status === 201,
    `auth.signup failed: ${signupResponse.status} ${JSON.stringify(signupBody)}`
  );

  assert(signupBody.webId, 'signup response missing webId');
  assert(signupBody.token, 'signup response missing token');
  assert(signupBody.newUser === true, 'signup response newUser should be true');

  const webIdUrl = new URL(signupBody.webId);
  assert(
    webIdUrl.pathname.split('/').filter(Boolean)[0] === normalizedUsername,
    `webId path ${webIdUrl.pathname} must be rooted at username ${normalizedUsername}`
  );

  assert(signupBody.activityPubActorId === signupBody.webId, 'signup ActivityPub actor must equal WebID');
  assert(signupBody.activityPubHandle, 'signup response missing activityPubHandle');
  assert(
    signupBody.activityPubHandle === `@${normalizedUsername}@${webIdUrl.hostname}`,
    `activityPubHandle ${signupBody.activityPubHandle} must equal @${normalizedUsername}@${webIdUrl.hostname}`
  );

  const actor = await requestActor(signupBody.webId);
  assert((actor.id || actor['@id']) === signupBody.webId, 'ActivityPub actor id must equal WebID');
  assert(actor.preferredUsername === normalizedUsername, 'ActivityPub preferredUsername must match signup username');
  assert(actor.inbox && actor.outbox, 'ActivityPub actor missing inbox/outbox');

  // auth.signup now returns ATProto provisioning details directly.
  assert(signupBody.atprotoDid, 'signup response missing atprotoDid');
  assert(
    /^did:plc:[a-z2-7]{24}$/.test(signupBody.atprotoDid),
    `expected did:plc DID with 24-char base32 identifier, got ${signupBody.atprotoDid}`
  );
  assert(signupBody.atprotoHandle, 'signup response missing atprotoHandle');
  assert(
    signupBody.atprotoHandle === expectedAtprotoHandle(normalizedUsername),
    `atprotoHandle ${signupBody.atprotoHandle} must match username-derived handle ${expectedAtprotoHandle(normalizedUsername)}`
  );
  assert(signupBody.atprotoRepoInitialized === true, 'signup response atprotoRepoInitialized must be true');

  // Pod-bound PDS policy: signup must return a PDS URL whose origin matches
  // the WebID origin (i.e. the Pod that hosts the account).
  const podOrigin = (() => {
    const u = new URL(signupBody.webId);
    return `${u.protocol}//${u.host}`;
  })();
  assert(signupBody.atprotoPdsUrl, 'signup response missing atprotoPdsUrl');
  assert(
    signupBody.atprotoPdsUrl === podOrigin,
    `atprotoPdsUrl ${signupBody.atprotoPdsUrl} must match Pod origin ${podOrigin}`
  );

  // Verify identity bindings + key refs exist via internal projection API.
  const projection = await requestProjectionWithRetry(base, token, signupBody.webId);

  assert(projection.canonicalAccountId === signupBody.webId, 'projection canonicalAccountId mismatch');
  assert(projection.webId === signupBody.webId, 'projection webId mismatch');
  assert(projection.activityPubActorId === signupBody.webId, 'projection ActivityPub actor must equal WebID');
  assert(projection.activityPubHandle === signupBody.activityPubHandle, 'projection activityPubHandle mismatch');
  assert(projection.atprotoDid === signupBody.atprotoDid, 'projection atprotoDid mismatch');
  assert(projection.atprotoHandle === signupBody.atprotoHandle, 'projection atprotoHandle mismatch');
  assert(projection.atSigningKeyRef, 'projection missing atSigningKeyRef');
  assert(projection.atRotationKeyRef, 'projection missing atRotationKeyRef');
  assert(
    projection.atprotoPdsUrl === signupBody.atprotoPdsUrl,
    `projection atprotoPdsUrl ${projection.atprotoPdsUrl} must match signup ${signupBody.atprotoPdsUrl}`
  );
  assert(projection.repo && projection.repo.initialized === true, 'projection repo.initialized must be true');
  assert(projection.repo.rootCid, 'projection repo.rootCid missing');
  assert(projection.repo.rev, 'projection repo.rev missing');

  console.log(
    JSON.stringify(
      {
        ok: true,
        signup: {
          webId: signupBody.webId,
          activityPubActorId: signupBody.activityPubActorId,
          activityPubHandle: signupBody.activityPubHandle,
          atprotoDid: signupBody.atprotoDid,
          atprotoHandle: signupBody.atprotoHandle,
          atprotoPdsUrl: signupBody.atprotoPdsUrl,
          atprotoRepoInitialized: signupBody.atprotoRepoInitialized
        },
        projection: {
          canonicalAccountId: projection.canonicalAccountId,
          webId: projection.webId,
          activityPubActorId: projection.activityPubActorId,
          activityPubHandle: projection.activityPubHandle,
          atprotoHandle: projection.atprotoHandle,
          atSigningKeyRef: projection.atSigningKeyRef,
          atRotationKeyRef: projection.atRotationKeyRef,
          atprotoPdsUrl: projection.atprotoPdsUrl,
          repo: projection.repo
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
