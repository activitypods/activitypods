"use strict";

const fetch = require("node-fetch");

const DEFAULT_BASE_URL = "http://localhost:3000";
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
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  throw new Error("projection lookup failed after retries");
}

(async () => {
  const base = env("BACKEND_BASE_URL", DEFAULT_BASE_URL).replace(/\/$/, "");
  const token = env("ACTIVITYPODS_TOKEN", "test-atproto-signing-token-local");
  const password = env("SIGNUP_PASSWORD", "Phase7LivePass123");

  const username = process.env.SIGNUP_USERNAME || uniqueUsername();
  const email = process.env.SIGNUP_EMAIL || `${username}@example.com`;

  const signupResponse = await fetch(`${base}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    timeout: Number(process.env.PROOF_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    body: JSON.stringify({ username, email, password })
  });
  const signupBody = await asJson(signupResponse);

  assert(
    signupResponse.status === 200 || signupResponse.status === 201,
    `auth.signup failed: ${signupResponse.status} ${JSON.stringify(signupBody)}`
  );

  assert(signupBody.webId, "signup response missing webId");
  assert(signupBody.token, "signup response missing token");
  assert(signupBody.newUser === true, "signup response newUser should be true");

  // auth.signup now returns ATProto provisioning details directly.
  assert(signupBody.atprotoDid, "signup response missing atprotoDid");
  assert(signupBody.atprotoDid.startsWith("did:plc:"), `expected did:plc DID, got ${signupBody.atprotoDid}`);
  assert(signupBody.atprotoHandle, "signup response missing atprotoHandle");
  assert(
    signupBody.atprotoRepoInitialized === true,
    "signup response atprotoRepoInitialized must be true"
  );

  // Verify identity bindings + key refs exist via internal projection API.
  const projection = await requestProjectionWithRetry(base, token, signupBody.webId);

  assert(projection.canonicalAccountId === signupBody.webId, "projection canonicalAccountId mismatch");
  assert(projection.atprotoDid === signupBody.atprotoDid, "projection atprotoDid mismatch");
  assert(projection.atprotoHandle === signupBody.atprotoHandle, "projection atprotoHandle mismatch");
  assert(projection.atSigningKeyRef, "projection missing atSigningKeyRef");
  assert(projection.atRotationKeyRef, "projection missing atRotationKeyRef");
  assert(projection.repo && projection.repo.initialized === true, "projection repo.initialized must be true");
  assert(projection.repo.rootCid, "projection repo.rootCid missing");
  assert(projection.repo.rev, "projection repo.rev missing");

  console.log(
    JSON.stringify(
      {
        ok: true,
        signup: {
          webId: signupBody.webId,
          atprotoDid: signupBody.atprotoDid,
          atprotoHandle: signupBody.atprotoHandle,
          atprotoRepoInitialized: signupBody.atprotoRepoInitialized
        },
        projection: {
          canonicalAccountId: projection.canonicalAccountId,
          atSigningKeyRef: projection.atSigningKeyRef,
          atRotationKeyRef: projection.atRotationKeyRef,
          repo: projection.repo
        }
      },
      null,
      2
    )
  );
})().catch((error) => {
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
