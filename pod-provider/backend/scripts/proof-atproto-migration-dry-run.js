'use strict';

/* eslint-disable no-console */
const fetch = require('node-fetch');

function env(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

function redact(value) {
  return JSON.parse(
    JSON.stringify(value || {})
      .replace(/"sourceAccessToken"\s*:\s*"[^"]+"/g, '"sourceAccessToken":"[redacted]"')
      .replace(/"accessJwt"\s*:\s*"[^"]+"/g, '"accessJwt":"[redacted]"')
      .replace(/"refreshJwt"\s*:\s*"[^"]+"/g, '"refreshJwt":"[redacted]"')
  );
}

async function asJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

(async () => {
  const base = env('MIGRATION_PROOF_BASE_URL', 'http://localhost:3000').replace(/\/$/, '');
  const canonicalAccountId = env('MIGRATION_PROOF_CANONICAL_ACCOUNT_ID');
  const userToken = env('MIGRATION_PROOF_USER_TOKEN');
  const sourceAccessToken = env('MIGRATION_PROOF_SOURCE_ACCESS_TOKEN');

  const response = await fetch(`${base}/api/accounts/migrate-atproto`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${userToken}`,
      'content-type': 'application/json',
      'x-request-id': `proof-dry-${Date.now()}`
    },
    body: JSON.stringify({
      canonicalAccountId,
      dryRun: true,
      sourceAccessToken
    })
  });

  const body = await asJson(response);
  if (!(response.status === 200 || response.status === 202)) {
    throw new Error(`dry-run failed: ${response.status} ${JSON.stringify(redact(body))}`);
  }

  if (!body || body.migrationDryRun !== true || body.migrationState !== 'completed') {
    throw new Error(`dry-run unexpected result: ${JSON.stringify(redact(body))}`);
  }

  console.log(JSON.stringify({ ok: true, kind: 'dry-run', result: redact(body) }, null, 2));
})().catch(error => {
  console.error(JSON.stringify({ ok: false, kind: 'dry-run', error: error.message }, null, 2));
  process.exit(1);
});
