'use strict';

const fetch = require('node-fetch');

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_ATTEMPTS = 5;

function env(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing env ${name}`);
  }
  return value;
}

function optionalEnv(name, fallback = null) {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function computeFullJitterDelay(attempt) {
  const cap = Math.min(250 * Math.pow(2, attempt - 1), 5_000);
  return Math.floor(Math.random() * cap);
}

function redact(value) {
  const json = JSON.stringify(value);
  return JSON.parse(
    json.replace(/("password"\s*:\s*")[^"]+(")/gi, '$1[redacted]$2')
      .replace(/("accessJwt"\s*:\s*")[^"]+(")/gi, '$1[redacted]$2')
      .replace(/("refreshJwt"\s*:\s*")[^"]+(")/gi, '$1[redacted]$2')
  );
}

async function asJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function fetchJsonWithRetry(url, options = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        timeout: DEFAULT_TIMEOUT_MS
      });
      const body = await asJson(response);

      if (!response.ok && isRetryableStatus(response.status) && attempt < DEFAULT_MAX_ATTEMPTS) {
        await sleep(computeFullJitterDelay(attempt));
        continue;
      }

      return { response, body };
    } catch (error) {
      lastError = error;
      if (attempt >= DEFAULT_MAX_ATTEMPTS) break;
      await sleep(computeFullJitterDelay(attempt));
    }
  }

  throw lastError || new Error('request failed');
}

(async () => {
  const base = env('BACKEND_BASE_URL', 'http://localhost:3000').replace(/\/$/, '');
  const activitypods = {
    canonicalAccountId: optionalEnv('LINK_ACTIVITYPODS_CANONICAL_ACCOUNT_ID'),
    username: optionalEnv('LINK_ACTIVITYPODS_USERNAME'),
    email: optionalEnv('LINK_ACTIVITYPODS_EMAIL'),
    password: env('LINK_ACTIVITYPODS_PASSWORD'),
    profile: {
      displayName: optionalEnv('LINK_ACTIVITYPODS_DISPLAY_NAME', 'Linked External ATProto User'),
      summary: optionalEnv('LINK_ACTIVITYPODS_SUMMARY', 'External ATProto linking proof')
    }
  };

  const requestBody = {
    activitypods,
    atproto: {
      pdsUrl: env('LINK_ATPROTO_PDS_URL'),
      identifier: env('LINK_ATPROTO_IDENTIFIER'),
      password: env('LINK_ATPROTO_PASSWORD'),
      did: optionalEnv('LINK_ATPROTO_DID'),
      handle: optionalEnv('LINK_ATPROTO_HANDLE')
    }
  };

  const { response, body } = await fetchJsonWithRetry(`${base}/api/accounts/link-atproto`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  assert(
    response.status === 200 || response.status === 201,
    `link-atproto failed: ${response.status} ${JSON.stringify(redact(body))}`
  );

  assert(body.canonicalAccountId, 'missing canonicalAccountId');
  assert(body.webId, 'missing webId');
  assert(body.atproto, 'missing atproto block');
  assert(body.atproto.did, 'missing atproto.did');
  assert(body.atproto.handle, 'missing atproto.handle');
  assert(body.atproto.source === 'external', 'atproto.source must be external');
  assert(body.atproto.managed === false, 'atproto.managed must be false');
  assert(body.atproto.pdsUrl, 'missing atproto.pdsUrl');
  assert(body.linking?.state === 'completed', 'linking.state must be completed');

  console.log(
    JSON.stringify(
      redact({
        ok: true,
        status: response.status,
        result: body
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
