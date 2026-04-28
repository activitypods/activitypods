/* eslint-disable @typescript-eslint/promise-function-async */
import urlJoin from 'url-join';

declare const CONFIG: { BACKEND_URL: string };

const BASE = urlJoin(CONFIG.BACKEND_URL, '/api/dashboard');

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' ? (value as UnknownRecord) : null;

const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

function headers() {
  const token = localStorage.getItem('token');
  const h = new Headers({ 'Content-Type': 'application/json' });
  if (token) h.set('Authorization', `Bearer ${token}`);
  return h;
}

async function reqWithBase(base: string, path: string, options: RequestInit = {}) {
  const res = await fetch(urlJoin(base, path), {
    ...options,
    headers: headers()
  });

  let json: unknown = {};
  const text = await res.text();

  try {
    json = text ? JSON.parse(text) : {};
  } catch (parseError) {
    // If JSON parsing fails, json remains an empty object
    console.error(`Failed to parse JSON response from ${path}:`, parseError);
  }

  if (!res.ok) {
    const payload = asRecord(json);
    const errorPayload = asRecord(payload?.error);
    const errorMessage = asString(errorPayload?.message) || asString(payload?.message) || `Request failed (${res.status})`;
    const error: Error & { code?: string; status?: number; details?: unknown; requestId?: string } = new Error(
      errorMessage
    );
    error.code = asString(errorPayload?.code);
    error.status = res.status;
    error.details = errorPayload?.details;
    error.requestId = asString(errorPayload?.requestId);
    throw error;
  }

  return json;
}

async function req(path: string, options: RequestInit = {}) {
  return reqWithBase(BASE, path, options);
}

async function apiReq(path: string, options: RequestInit = {}) {
  return reqWithBase(CONFIG.BACKEND_URL, path, options);
}

export const dashboardApi = {
  whoami: () => req('whoami'),

  getDashboardRole: () => req('settings/dashboard-role'),

  list: (container: string) => req(`settings/${encodeURIComponent(container)}`),

  create: (container: string, data: unknown) =>
    req(`settings/${encodeURIComponent(container)}`, {
      method: 'POST',
      body: JSON.stringify({ data })
    }),

  update: (resourceUri: string, data: unknown) =>
    req('settings', {
      method: 'PUT',
      body: JSON.stringify({ resourceUri, data })
    }),

  patch: (resourceUri: string, data: unknown) =>
    req('settings', {
      method: 'PATCH',
      body: JSON.stringify({ resourceUri, data })
    }),

  remove: (resourceUri: string) =>
    req('settings/delete', {
      method: 'POST',
      body: JSON.stringify({ resourceUri })
    }),

  listAppConsents: () => req('settings/app-consents'),

  createAppConsent: (data: unknown) =>
    req('settings/app-consents', {
      method: 'POST',
      body: JSON.stringify({ data })
    }),

  getBlockedListVisibility: () => apiReq('/api/block-lists/blocked/visibility'),

  setBlockedListVisibility: (isPublic: boolean) =>
    apiReq('/api/block-lists/blocked/visibility', {
      method: 'PUT',
      body: JSON.stringify({ public: isPublic })
    }),

  getMutedListVisibility: () => apiReq('/api/mute-lists/muted/visibility'),

  setMutedListVisibility: (isPublic: boolean) =>
    apiReq('/api/mute-lists/muted/visibility', {
      method: 'PUT',
      body: JSON.stringify({ public: isPublic })
    }),

  listFollowedHashtags: () => req('hashtags/follows'),

  followHashtag: (data: { tag: string; notify?: boolean; includeCrossProtocol?: boolean; includeRelated?: boolean }) =>
    req('hashtags/follows', {
      method: 'POST',
      body: JSON.stringify({ data })
    }),

  unfollowHashtag: (tag: string) =>
    req('hashtags/follows', {
      method: 'DELETE',
      body: JSON.stringify({ data: { tag } })
    }),

  importFollowedHashtags: (data: { tags: string[] | string; replace?: boolean }) =>
    req('hashtags/follows/import', {
      method: 'POST',
      body: JSON.stringify({ data })
    }),

  previewSource: (url: string) => req(`settings/preview?url=${encodeURIComponent(url)}`),

  listMrfRegistry: () => req('mrf/registry'),

  getMrfRegistryItem: (moduleId: string) => req(`mrf/registry/${encodeURIComponent(moduleId)}`),

  listMrfModules: () => req('mrf/modules'),

  getMrfModule: (moduleId: string) => req(`mrf/modules/${encodeURIComponent(moduleId)}`),

  patchMrfModule: (moduleId: string, data: unknown) =>
    req(`mrf/modules/${encodeURIComponent(moduleId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ data })
    }),

  getMrfChain: () => req('mrf/chain'),

  patchMrfChain: (data: unknown) =>
    req('mrf/chain', {
      method: 'PATCH',
      body: JSON.stringify({ data })
    }),

  listMrfTraces: (query?: Record<string, string | number | boolean>) => {
    const params = query ? new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])) : null;
    return req(params ? `mrf/traces?${params.toString()}` : 'mrf/traces');
  },

  getMrfTrace: (traceId: string, includePrivate = false) =>
    req(
      includePrivate
        ? `mrf/traces/${encodeURIComponent(traceId)}?includePrivate=true`
        : `mrf/traces/${encodeURIComponent(traceId)}`
    ),

  getMrfTraceChain: (traceId: string, includePrivate = false) =>
    req(
      includePrivate
        ? `mrf/traces/${encodeURIComponent(traceId)}/chain?includePrivate=true`
        : `mrf/traces/${encodeURIComponent(traceId)}/chain`
    ),

  getMrfTraceSuggestions: (traceId: string) => req(`mrf/traces/${encodeURIComponent(traceId)}/suggestions`),

  getMrfMetrics: (query?: Record<string, string | number | boolean>) => {
    const params = query ? new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])) : null;
    return req(params ? `mrf/metrics?${params.toString()}` : 'mrf/metrics');
  },

  createMrfSimulation: (data: unknown) =>
    req('mrf/simulations', {
      method: 'POST',
      body: JSON.stringify({ data })
    }),

  getMrfSimulation: (jobId: string) => req(`mrf/simulations/${encodeURIComponent(jobId)}`),

  // ─── Spam domain reputation blocklist ────────────────────────────────────

  listSpamDomains: () => req('spam/domains'),

  addSpamDomain: (data: { domain: string; subdomainMatch: boolean }) =>
    req('spam/domains', {
      method: 'POST',
      body: JSON.stringify({ data })
    }),

  removeSpamDomain: (data: { domain: string; subdomainMatch: boolean }) =>
    req('spam/domains', {
      method: 'DELETE',
      body: JSON.stringify({ data })
    }),

  // ─── Provider platform management ────────────────────────────────────────
  getProviderStats: () => req('provider/stats'),

  listProviderPods: () => req('provider/pods'),

  listAnnouncements: () => req('provider/announcements'),

  createAnnouncement: (data: { content: string; startsAt?: string; endsAt?: string; allDay?: boolean }) =>
    req('provider/announcements', { method: 'POST', body: JSON.stringify({ data }) }),

  deleteAnnouncement: (id: string) => req(`provider/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listInvitations: () => req('provider/invitations'),

  createInvitation: (data: { maxUses?: number; expiresAt?: string; note?: string }) =>
    req('provider/invitations', { method: 'POST', body: JSON.stringify({ data }) }),

  revokeInvitation: (id: string) => req(`provider/invitations/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listAuditLog: (limit?: number) => req(limit ? `provider/audit-log?limit=${limit}` : 'provider/audit-log'),

  applyModerationDecision: (data: {
    targetWebId?: string;
    targetActorUri?: string;
    targetAtDid?: string;
    targetHandle?: string;
    sourceCaseId?: string;
    action: 'label' | 'warn' | 'filter' | 'block' | 'suspend';
    labels?: string[];
    reason?: string;
  }) =>
    req('provider/moderation/decisions', {
      method: 'POST',
      body: JSON.stringify({ data })
    }),

  listModerationDecisions: (query?: Record<string, string | number | boolean>) => {
    const params = query ? new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])) : null;
    return req(params ? `provider/moderation/decisions?${params.toString()}` : 'provider/moderation/decisions');
  },

  listModerationCases: (query?: Record<string, string | number | boolean>) => {
    const params = query ? new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])) : null;
    return req(params ? `provider/moderation/cases?${params.toString()}` : 'provider/moderation/cases');
  },

  updateModerationCaseStatus: (id: string, status: 'open' | 'dismissed') =>
    req(`provider/moderation/cases/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { status } })
    }),

  retryModerationCaseForwarding: (
    id: string,
    data: {
      protocols?: ('activityPub' | 'atproto')[];
      enableRemoteForwarding?: boolean;
    }
  ) =>
    req(`provider/moderation/cases/${encodeURIComponent(id)}/forwarding/retry`, {
      method: 'POST',
      body: JSON.stringify({ data })
    }),

  revokeModerationDecision: (id: string) =>
    req(`provider/moderation/decisions/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  listAtLabels: (query?: Record<string, string | number | boolean>) => {
    const params = query ? new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])) : null;
    return req(params ? `provider/moderation/labels?${params.toString()}` : 'provider/moderation/labels');
  },

  listKnownAtLabels: () => req('provider/moderation/labels/known'),

  getProviderDefaultModerationSourceStatus: () => req('provider/moderation/default-source'),

  getPdqHashStatus: () => req('provider/moderation/pdq/status'),

  getFediseerStatus: () => req('provider/moderation/fediseer/status'),

  lookupPdqHash: (data: { imageUrl: string }) =>
    req('provider/moderation/pdq/hash', {
      method: 'POST',
      body: JSON.stringify({ data })
    }),

  createModerationReport: (data: unknown) =>
    req('moderation/reports', {
      method: 'POST',
      body: JSON.stringify({ data })
    }),

  listMyModerationCases: (query?: Record<string, string | number | boolean>) => {
    const params = query ? new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])) : null;
    return apiReq(params ? `/api/moderation/reports?${params.toString()}` : '/api/moderation/reports');
  },

  getMyModerationCase: (id: string) => apiReq(`/api/moderation/reports/${encodeURIComponent(id)}`),

  listMyModerationDecisions: (query?: Record<string, string | number | boolean>) => {
    const params = query ? new URLSearchParams(Object.entries(query).map(([k, v]) => [k, String(v)])) : null;
    return apiReq(params ? `/api/moderation/actions?${params.toString()}` : '/api/moderation/actions');
  },

  syncFediseerDomainSignals: (data: {
    sourceDomains?: string[];
    apply?: boolean;
    replaceExisting?: boolean;
    includeCensures?: boolean;
    includeHesitations?: boolean;
    censureAction?: 'reject' | 'filter';
    hesitationAction?: 'filter' | 'reject';
    maxPages?: number;
  }) =>
    req('provider/moderation/fediseer/sync', {
      method: 'POST',
      body: JSON.stringify({ data })
    }),

  fetchAtprotoModerationLists: (data: {
    identifier?: string;
    password?: string;
    pdsUrl?: string;
    limit?: number;
    maxPages?: number;
  }) =>
    req('moderation/atproto/lists/fetch', {
      method: 'POST',
      body: JSON.stringify({ data })
    }),

  syncAtprotoModerationLists: (data: {
    identifier?: string;
    password?: string;
    pdsUrl?: string;
    limit?: number;
    maxPages?: number;
    replace?: boolean;
  }) =>
    req('moderation/atproto/lists/sync', {
      method: 'POST',
      body: JSON.stringify({ data })
    }),

  listAtprotoLabelerCatalog: () => req('moderation/atproto/labelers/catalog'),

  getAtprotoModerationSyncConfig: () => req('moderation/atproto/sync/config'),

  setAtprotoModerationSyncConfig: (data: {
    enabled?: boolean;
    replace?: boolean;
    intervalHours?: number;
    pdsUrl?: string;
    identifier?: string;
    password?: string | null;
  }) =>
    req('moderation/atproto/sync/config', {
      method: 'POST',
      body: JSON.stringify({ data })
    }),

  runAtprotoModerationSyncNow: (reason = 'manual') =>
    req('moderation/atproto/sync/run', {
      method: 'POST',
      body: JSON.stringify({ data: { reason } })
    }),

  resolveAtprotoHandle: (handle: string, pdsUrl?: string) => {
    const params = new URLSearchParams({ handle });
    if (pdsUrl) params.set('pdsUrl', pdsUrl);
    return req(`moderation/atproto/resolve-handle?${params.toString()}`);
  },

  getMonthlyModerationSummary: () => req('moderation/summary/monthly'),

  sendMonthlyModerationSummary: (force = false) =>
    req('moderation/summary/monthly/send', {
      method: 'POST',
      body: JSON.stringify({ force })
    }),

  listProviderInboxEvents: (limit?: number) =>
    req(limit ? `provider/moderation/inbox-events?limit=${limit}` : 'provider/moderation/inbox-events')
};
