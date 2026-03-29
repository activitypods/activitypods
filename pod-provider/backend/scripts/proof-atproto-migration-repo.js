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
      .replace(/"accessJwt"\s*:\s*"[^"]+"/g, '"accessJwt":"[redacted]"')
      .replace(/"refreshJwt"\s*:\s*"[^"]+"/g, '"refreshJwt":"[redacted]"')
  );
}

(async () => {
  const base = env('MIGRATION_PROOF_BASE_URL', 'http://localhost:3000').replace(/\/$/, '');
  const canonicalAccountId = env('MIGRATION_PROOF_CANONICAL_ACCOUNT_ID');
  const userToken = env('MIGRATION_PROOF_USER_TOKEN');
  const sourceAccessToken = env('MIGRATION_PROOF_SOURCE_ACCESS_TOKEN');

  const start = await fetch(`${base}/api/accounts/migrate-atproto`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${userToken}`,
      'content-type': 'application/json',
      'x-request-id': `proof-repo-start-${Date.now()}`
    },
    body: JSON.stringify({
      canonicalAccountId,
      sourceAccessToken,
      migrateBlobs: false,
      migratePreferences: false
    })
  });

  const started = await asJson(start);
  if (!(start.status === 200 || start.status === 202)) {
    throw new Error(`repo migration start failed: ${start.status} ${JSON.stringify(redact(started))}`);
  }

  const statusRes = await fetch(`${base}/api/accounts/migrate-atproto/status?canonicalAccountId=${encodeURIComponent(canonicalAccountId)}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${userToken}`,
      'x-request-id': `proof-repo-status-${Date.now()}`
    }
  });
  const status = await asJson(statusRes);
  if (!statusRes.ok) {
    throw new Error(`repo migration status failed: ${statusRes.status} ${JSON.stringify(redact(status))}`);
  }

  const acceptable = new Set(['repo_imported', 'blobs_migrated', 'preferences_migrated', 'activated', 'completed']);
  if (!acceptable.has(String(status.migrationState || ''))) {
    throw new Error(`repo migration did not reach repo phase: ${JSON.stringify(redact(status))}`);
  }

  console.log(JSON.stringify({ ok: true, kind: 'repo', started: redact(started), status: redact(status) }, null, 2));
})().catch(error => {
  console.error(JSON.stringify({ ok: false, kind: 'repo', error: error.message }, null, 2));
  process.exit(1);
});
