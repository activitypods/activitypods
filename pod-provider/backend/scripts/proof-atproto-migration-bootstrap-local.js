'use strict';

/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const DEFAULT_BACKEND_BASE = 'http://localhost:3000';
const DEFAULT_SIDECAR_BASE = 'http://localhost:8085';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_PASSWORD = 'Phase7LivePass123';

function env(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing env ${name}`);
  }
  return String(value);
}

function uniqueName(prefix) {
  const rand = Math.random().toString(36).slice(2, 12);
  return `${prefix}${rand}`.slice(0, 15);
}

function candidateUsername(configuredBase, fallbackPrefix) {
  if (configuredBase) {
    const rand = Math.random().toString(36).slice(2, 10);
    const prefix = String(configuredBase).replace(/[^a-z0-9-]/gi, '').slice(0, 7) || fallbackPrefix;
    return `${prefix}${rand}`.slice(0, 15);
  }
  return uniqueName(fallbackPrefix);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function computeBackoffMs(attempt) {
  const cap = Math.min(250 * Math.pow(2, attempt - 1), 5_000);
  return Math.floor(Math.random() * cap);
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
  const json = JSON.stringify(value || {});
  return JSON.parse(
    json
      .replace(/("password"\s*:\s*")[^"]+("?)/gi, '$1[redacted]$2')
      .replace(/("token"\s*:\s*")[^"]+("?)/gi, '$1[redacted]$2')
      .replace(/("accessJwt"\s*:\s*")[^"]+("?)/gi, '$1[redacted]$2')
      .replace(/("refreshJwt"\s*:\s*")[^"]+("?)/gi, '$1[redacted]$2')
      .replace(/("sourceAccessToken"\s*:\s*")[^"]+("?)/gi, '$1[redacted]$2')
  );
}

async function requestJson(url, options = {}, { maxAttempts = DEFAULT_MAX_ATTEMPTS } = {}) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        timeout: Number(process.env.MIGRATION_BOOTSTRAP_TIMEOUT_MS || DEFAULT_TIMEOUT_MS)
      });
      const body = await asJson(response);

      if (!response.ok && isRetryableStatus(response.status) && attempt < maxAttempts) {
        await sleep(computeBackoffMs(attempt));
        continue;
      }

      return { response, body };
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(computeBackoffMs(attempt));
      }
    }
  }

  throw lastError || new Error(`Request failed for ${url}`);
}

async function createSourceAccount(backendBase, sourcePassword) {
  const maxAttempts = Number(process.env.MIGRATION_BOOTSTRAP_ACCOUNT_CREATE_ATTEMPTS || DEFAULT_MAX_ATTEMPTS);
  const configuredBase = (process.env.MIGRATION_BOOTSTRAP_SOURCE_USERNAME || '').trim();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const username = candidateUsername(configuredBase, 'msrc');
    const payload = {
      username,
      email: `${username}@example.com`,
      password: sourcePassword,
      profile: {
        displayName: `${username}-source`,
        summary: 'ATProto migration local source account'
      },
      solid: { enabled: true },
      activitypub: { enabled: true },
      atproto: { enabled: true, didMethod: 'plc' }
    };

    const { response, body } = await requestJson(`${backendBase}/api/accounts/create`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if ((response.status === 409 || isRetryableStatus(response.status)) && attempt < maxAttempts) {
      await sleep(computeBackoffMs(attempt));
      continue;
    }

    if (!(response.status === 200 || response.status === 201)) {
      throw new Error(`create source account failed for ${username}: ${response.status} ${JSON.stringify(redact(body))}`);
    }

    if (!body?.atproto?.did) {
      throw new Error('create source account missing atproto.did');
    }

    return {
      username,
      password: sourcePassword,
      canonicalAccountId: body.canonicalAccountId,
      did: body.atproto.did,
      handle: body.atproto.handle
    };
  }

  throw new Error('Unable to create source account');
}

async function createSourceSession(sidecarBase, identifier, password) {
  const { response, body } = await requestJson(`${sidecarBase}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password })
  });

  if (!response.ok) {
    throw new Error(`create source session failed: ${response.status} ${JSON.stringify(redact(body))}`);
  }

  if (!body?.accessJwt) {
    throw new Error('create source session missing accessJwt');
  }

  return {
    accessJwt: String(body.accessJwt),
    refreshJwt: body.refreshJwt ? String(body.refreshJwt) : null
  };
}

async function linkTargetAccountAsExternal(backendBase, sidecarBase, sourceIdentifier, sourcePassword, targetPassword) {
  const maxAttempts = Number(process.env.MIGRATION_BOOTSTRAP_ACCOUNT_LINK_ATTEMPTS || DEFAULT_MAX_ATTEMPTS);
  const configuredBase = (process.env.MIGRATION_BOOTSTRAP_TARGET_USERNAME || '').trim();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const targetUsername = candidateUsername(configuredBase, 'mdst');

    const payload = {
      activitypods: {
        username: targetUsername,
        email: `${targetUsername}@example.com`,
        password: targetPassword,
        profile: {
          displayName: `${targetUsername}-target`,
          summary: 'ATProto migration local target account linked to external source'
        }
      },
      atproto: {
        pdsUrl: sidecarBase,
        identifier: sourceIdentifier,
        password: sourcePassword
      }
    };

    const { response, body } = await requestJson(`${backendBase}/api/accounts/link-atproto`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if ((response.status === 409 || isRetryableStatus(response.status)) && attempt < maxAttempts) {
      await sleep(computeBackoffMs(attempt));
      continue;
    }

    if (!(response.status === 200 || response.status === 201)) {
      throw new Error(`link external account failed: ${response.status} ${JSON.stringify(redact(body))}`);
    }

    if (String(body?.atproto?.source) !== 'external' || body?.atproto?.managed !== false) {
      throw new Error(`linked account is not external-managed=false: ${JSON.stringify(redact(body))}`);
    }

    return {
      username: targetUsername,
      password: targetPassword,
      canonicalAccountId: body.canonicalAccountId,
      did: body.atproto.did,
      handle: body.atproto.handle
    };
  }

  throw new Error('Unable to create external-linked target account');
}

async function loginForUserToken(backendBase, username, password) {
  const { response, body } = await requestJson(`${backendBase}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  if (!response.ok) {
    throw new Error(`auth login failed: ${response.status} ${JSON.stringify(redact(body))}`);
  }

  if (!body?.token) {
    throw new Error(`auth login missing token: ${JSON.stringify(redact(body))}`);
  }

  return String(body.token);
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function writeEnvFile(filePath, vars) {
  const absPath = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });

  const lines = [
    '# Auto-generated by proof-atproto-migration-bootstrap-local.js',
    '# Local development secrets only. Regenerate as needed.'
  ];

  Object.entries(vars).forEach(([key, value]) => {
    lines.push(`${key}=${shellQuote(value)}`);
  });

  fs.writeFileSync(absPath, `${lines.join('\n')}\n`, { mode: 0o600 });
  return absPath;
}

(async () => {
  const backendBase = env('MIGRATION_PROOF_BASE_URL', DEFAULT_BACKEND_BASE).replace(/\/$/, '');
  const sidecarBase = env('MIGRATION_PROOF_SIDECAR_BASE_URL', DEFAULT_SIDECAR_BASE).replace(/\/$/, '');

  const sourcePassword = env('MIGRATION_BOOTSTRAP_SOURCE_PASSWORD', DEFAULT_PASSWORD);
  const targetPassword = env('MIGRATION_BOOTSTRAP_TARGET_PASSWORD', sourcePassword);

  const source = await createSourceAccount(backendBase, sourcePassword);
  const sourceSession = await createSourceSession(sidecarBase, source.did, source.password);

  const target = await linkTargetAccountAsExternal(
    backendBase,
    sidecarBase,
    source.did,
    source.password,
    targetPassword
  );

  const userToken = await loginForUserToken(backendBase, target.username, target.password);

  const exportsMap = {
    MIGRATION_PROOF_BASE_URL: backendBase,
    MIGRATION_PROOF_CANONICAL_ACCOUNT_ID: target.canonicalAccountId,
    MIGRATION_PROOF_USER_TOKEN: userToken,
    MIGRATION_PROOF_SOURCE_ACCESS_TOKEN: sourceSession.accessJwt,
    MIGRATION_PROOF_CONFIRM_PASSWORD: target.password
  };

  const envFile = process.env.MIGRATION_BOOTSTRAP_ENV_FILE || '.tmp/migration-proof.env';
  const envPath = writeEnvFile(envFile, exportsMap);

  console.log(
    JSON.stringify(
      redact({
        ok: true,
        backendBase,
        sidecarBase,
        envFile: envPath,
        source: {
          username: source.username,
          canonicalAccountId: source.canonicalAccountId,
          did: source.did,
          handle: source.handle
        },
        target: {
          username: target.username,
          canonicalAccountId: target.canonicalAccountId,
          did: target.did,
          handle: target.handle
        },
        next: {
          dryRun: `set -a; source ${envPath}; set +a; node scripts/proof-atproto-migration-dry-run.js`,
          full: `set -a; source ${envPath}; set +a; node scripts/proof-atproto-migration-full.js`
        }
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
