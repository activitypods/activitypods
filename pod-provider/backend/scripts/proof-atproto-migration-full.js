'use strict';

/* eslint-disable no-console */
const fetch = require('node-fetch');

function env(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

async function asJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function redact(value) {
  return JSON.parse(
    JSON.stringify(value || {})
      .replace(/"sourceAccessToken"\s*:\s*"[^"]+"/g, '"sourceAccessToken":"[redacted]"')
      .replace(/"password"\s*:\s*"[^"]+"/g, '"password":"[redacted]"')
      .replace(/"accessJwt"\s*:\s*"[^"]+"/g, '"accessJwt":"[redacted]"')
      .replace(/"refreshJwt"\s*:\s*"[^"]+"/g, '"refreshJwt":"[redacted]"')
  );
}

async function startMigration(base, token, payload) {
  const response = await fetch(`${base}/api/accounts/migrate-atproto`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-request-id': `proof-full-start-${Date.now()}`
    },
    body: JSON.stringify(payload)
  });
  const body = await asJson(response);
  if (!(response.status === 200 || response.status === 202)) {
    throw new Error(`startMigration failed: ${response.status} ${JSON.stringify(redact(body))}`);
  }
  return body;
}

async function confirmMigration(base, token, payload) {
  const response = await fetch(`${base}/api/accounts/migrate-atproto/confirm`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-request-id': `proof-full-confirm-${Date.now()}`
    },
    body: JSON.stringify(payload)
  });
  const body = await asJson(response);
  if (!(response.status === 200 || response.status === 202)) {
    throw new Error(`confirmMigration failed: ${response.status} ${JSON.stringify(redact(body))}`);
  }
  return body;
}

(async () => {
  const base = env('MIGRATION_PROOF_BASE_URL', 'http://localhost:3000').replace(/\/$/, '');
  const canonicalAccountId = env('MIGRATION_PROOF_CANONICAL_ACCOUNT_ID');
  const userToken = env('MIGRATION_PROOF_USER_TOKEN');
  const sourceAccessToken = env('MIGRATION_PROOF_SOURCE_ACCESS_TOKEN');
  const confirmPassword = env('MIGRATION_PROOF_CONFIRM_PASSWORD');

  const started = await startMigration(base, userToken, {
    canonicalAccountId,
    sourceAccessToken,
    migrateBlobs: true,
    migratePreferences: true
  });

  const confirmed = await confirmMigration(base, userToken, {
    canonicalAccountId,
    password: confirmPassword,
    migrateBlobs: true,
    migratePreferences: true,
    sourceAccessToken
  });

  if (String(confirmed.migrationState) !== 'completed') {
    throw new Error(`full migration did not complete: ${JSON.stringify(redact(confirmed))}`);
  }

  const statusRes = await fetch(`${base}/api/accounts/migrate-atproto/status?canonicalAccountId=${encodeURIComponent(canonicalAccountId)}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${userToken}`,
      'x-request-id': `proof-full-status-${Date.now()}`
    }
  });
  const status = await asJson(statusRes);
  if (!statusRes.ok || String(status.migrationState) !== 'completed') {
    throw new Error(`full migration status check failed: ${statusRes.status} ${JSON.stringify(redact(status))}`);
  }

  console.log(JSON.stringify({ ok: true, kind: 'full', started: redact(started), confirmed: redact(confirmed), status: redact(status) }, null, 2));
})().catch(error => {
  console.error(JSON.stringify({ ok: false, kind: 'full', error: error.message }, null, 2));
  process.exit(1);
});
