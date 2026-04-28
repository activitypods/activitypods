'use strict';

/**
 * Proof: authenticated provider dashboard access to provider inbox events.
 *
 * Verifies the browser-facing dashboard route used by dashboardApi:
 *   GET /api/dashboard/provider/moderation/inbox-events
 *
 * The proof can seed a deterministic provider inbox event through the internal
 * sidecar endpoint when ACTIVITYPODS_TOKEN is available, then reads it back via
 * the authenticated dashboard route.
 *
 * Required:
 *   DASHBOARD_PROOF_PROVIDER_TOKEN
 *     or DASHBOARD_PROOF_PROVIDER_USERNAME + DASHBOARD_PROOF_PROVIDER_PASSWORD
 *
 * Optional:
 *   BACKEND_BASE_URL                default http://localhost:3000
 *   ACTIVITYPODS_TOKEN              enables internal seed step
 *   DASHBOARD_PROOF_SKIP_SEED=true  skip seed step
 *   PROOF_TIMEOUT_MS                default 10000
 */

const fetch = require('node-fetch');

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_BACKEND_BASE = 'http://localhost:3000';

function env(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

function optionalEnv(name) {
  const value = process.env[name];
  return value === undefined || value === null || value === '' ? null : value;
}

async function parseBody(res) {
  const text = await res.text().catch(() => '');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { _raw: text };
  }
}

async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    timeout: Number(process.env.PROOF_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  return { res, body: await parseBody(res) };
}

async function loginForDashboardToken(baseUrl) {
  const directToken = optionalEnv('DASHBOARD_PROOF_PROVIDER_TOKEN');
  if (directToken) return directToken;

  const username = optionalEnv('DASHBOARD_PROOF_PROVIDER_USERNAME');
  const password = optionalEnv('DASHBOARD_PROOF_PROVIDER_PASSWORD');
  if (!username || !password) {
    throw new Error(
      'Set DASHBOARD_PROOF_PROVIDER_TOKEN or DASHBOARD_PROOF_PROVIDER_USERNAME/DASHBOARD_PROOF_PROVIDER_PASSWORD'
    );
  }

  const { res, body } = await requestJson(`${baseUrl}/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });

  if (!res.ok || !body?.token) {
    throw new Error(`provider login failed: ${res.status} ${JSON.stringify(body)}`);
  }

  return String(body.token);
}

async function seedProviderInboxEvent(baseUrl) {
  if (process.env.DASHBOARD_PROOF_SKIP_SEED === 'true') return null;

  const token = optionalEnv('ACTIVITYPODS_TOKEN') || optionalEnv('INTERNAL_API_TOKEN') || optionalEnv('SIDECAR_TOKEN');
  if (!token) return null;

  const activityId = `https://proof.local/provider-inbox-events/${Date.now()}`;
  const payload = {
    eventType: 'Accept',
    activityType: 'Accept',
    activityId,
    actorUri: 'https://remote.example/users/moderator',
    objectId: 'https://remote.example/activities/follow-1',
    envelopePath: '/users/provider/inbox',
    receivedAt: new Date().toISOString(),
    rawActivity: {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: activityId,
      type: 'Accept',
      actor: 'https://remote.example/users/moderator',
      object: 'https://remote.example/activities/follow-1'
    }
  };

  const { res, body } = await requestJson(`${baseUrl}/api/internal/moderation/inbox-events`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`internal provider inbox seed failed: ${res.status} ${JSON.stringify(body)}`);
  }

  return { activityId, body };
}

async function getDashboardInboxEvents(baseUrl, token) {
  const { res, body } = await requestJson(`${baseUrl}/api/dashboard/provider/moderation/inbox-events?limit=25`, {
    method: 'GET',
    headers: { authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    throw new Error(`dashboard inbox-events GET failed: ${res.status} ${JSON.stringify(body)}`);
  }

  if (!Array.isArray(body?.events) || typeof body?.total !== 'number') {
    throw new Error(`dashboard inbox-events response has wrong shape: ${JSON.stringify(body)}`);
  }

  return body;
}

async function assertAnonymousRejected(baseUrl) {
  const { res } = await requestJson(`${baseUrl}/api/dashboard/provider/moderation/inbox-events?limit=1`, {
    method: 'GET'
  });

  if (res.status !== 401 && res.status !== 403) {
    throw new Error(`anonymous dashboard request should be rejected, got ${res.status}`);
  }
}

(async () => {
  const baseUrl = env('BACKEND_BASE_URL', DEFAULT_BACKEND_BASE).replace(/\/$/, '');

  await assertAnonymousRejected(baseUrl);
  const token = await loginForDashboardToken(baseUrl);
  const seeded = await seedProviderInboxEvent(baseUrl);
  const dashboard = await getDashboardInboxEvents(baseUrl, token);

  if (seeded && !dashboard.events.some(event => event.activityId === seeded.activityId)) {
    throw new Error(`seeded provider inbox event was not visible in dashboard response: ${seeded.activityId}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        route: '/api/dashboard/provider/moderation/inbox-events',
        anonymousRejected: true,
        authenticated: true,
        seeded: Boolean(seeded),
        total: dashboard.total,
        returned: dashboard.events.length,
        seededActivityId: seeded?.activityId || null
      },
      null,
      2
    )
  );
})().catch(error => {
  console.error('[proof-provider-inbox-events-dashboard] FAIL', error.message);
  process.exitCode = 1;
});
