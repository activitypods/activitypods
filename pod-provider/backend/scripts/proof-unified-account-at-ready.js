"use strict";

const fetch = require("node-fetch");

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_PASSWORD = "Phase7LivePass123";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_ACCOUNT_CREATE_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_ATTEMPTS = 3;

function uniqueUsername() {
  const rand = Math.random().toString(36).slice(2, 11);
  return `u${Date.now()}${rand}`;
}

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

async function asJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function truncateForLogs(value, maxLength = 500) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}...`;
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function computeBackoffMs(attempt) {
  const base = 250 * Math.pow(2, attempt - 1);
  const jitter = Math.floor(Math.random() * 200);
  return Math.min(base + jitter, 2_500);
}

async function createAccountWithRetries(base, password) {
  const maxAttempts = Number(process.env.PROOF_ACCOUNT_CREATE_ATTEMPTS || 5);
  const createTimeoutMs = Number(
    process.env.PROOF_ACCOUNT_CREATE_TIMEOUT_MS || DEFAULT_ACCOUNT_CREATE_TIMEOUT_MS
  );

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const username = process.env.UNIFIED_USERNAME || uniqueUsername();
    const payload = {
      username,
      email: `${username}@example.com`,
      password,
      profile: {
        displayName: username,
        summary: "Signup should immediately provision AT identity"
      },
      solid: { enabled: true },
      activitypub: { enabled: true },
      atproto: {
        enabled: true,
        didMethod: "plc"
      }
    };

    let response;
    let body;

    try {
      response = await fetch(`${base}/api/accounts/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        timeout: createTimeoutMs,
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

    return { response, body };
  }

  throw new Error("Unable to create a unique unified account for AT-ready proof");
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
      if (attempt >= maxAttempts) {
        break;
      }
      await sleep(computeBackoffMs(attempt));
    }
  }

  throw lastError || new Error("Request failed");
}

(async () => {
  const base = env("BACKEND_BASE_URL", DEFAULT_BASE_URL).replace(/\/$/, "");
  const password = process.env.UNIFIED_PASSWORD || process.env.UNIFIED_TEST_PASSWORD || DEFAULT_PASSWORD;
  const { response, body } = await createAccountWithRetries(base, password);

  assert(
    response.status === 200 || response.status === 201,
    `create account failed: ${response.status} ${truncateForLogs(body)}`
  );

  assert(body && typeof body === "object", "missing JSON response body");
  assert(body.canonicalAccountId, "missing canonicalAccountId");
  assert(body.webId, "missing webId");

  assert(body.activitypub, "missing activitypub block");
  assert(body.activitypub.actorId, "missing activitypub.actorId");

  assert(body.atproto, "missing atproto block");
  assert(body.atproto.did, "missing atproto.did");
  assert(body.atproto.handle, "missing atproto.handle");
  assert(
    body.atproto.repoInitialized === true,
    "atproto.repoInitialized must be true"
  );
  assert(
    body.atproto.signingReady === true,
    "atproto.signingReady must be true"
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        canonicalAccountId: body.canonicalAccountId,
        webId: body.webId,
        activitypub: {
          actorId: body.activitypub.actorId,
          handle: body.activitypub.handle || null
        },
        atproto: {
          did: body.atproto.did,
          handle: body.atproto.handle,
          repoInitialized: body.atproto.repoInitialized,
          signingReady: body.atproto.signingReady
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
