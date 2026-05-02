const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { MoleculerError } = require('moleculer').Errors;
const { getDatasetFromUri } = require('@semapps/ldp');
const { sanitizeSparqlQuery } = require('@semapps/triplestore');
const { ulid } = require('ulid');
const { retryWithBackoff, CircuitBreaker, CircuitOpenError } = require('../../utils/backoff');
const { prepareForContainer, prepareAppConsent } = require('../../lib/user-settings-validators');
const { normalizeHashtag } = require('../../utils/hashtags');

const JSON_LD = 'application/ld+json';

const ALLOWED = new Set(['filters', 'blocks', 'mutes', 'preferences', 'app-consents', 'trust-sources']);

const IMMUTABLE_FIELDS = ['@context', '@id', 'id', 'type', '@type', 'createdAt', 'schemaVersion'];

const IMMUTABLE_FIELDS_BY_CONTAINER = {
  'app-consents': ['clientId']
};

const CONTEXT = {
  apods: 'https://activitypods.org/ns/core#',
  dc: 'http://purl.org/dc/terms/',
  type: '@type',
  id: '@id',
  pattern: 'apods:pattern',
  terms: 'apods:terms',
  action: 'apods:action',
  matchType: 'apods:matchType',
  includeHashtagVariants: 'apods:includeHashtagVariants',
  duration: 'apods:duration',
  expiresAt: 'apods:expiresAt',
  subjectCanonicalId: 'apods:subjectCanonicalId',
  subjectProtocol: 'apods:subjectProtocol',
  clientId: 'apods:clientId',
  permissions: 'apods:permissions',
  source: 'apods:source',
  sourceType: 'apods:sourceType',
  enabled: 'apods:enabled',
  weight: 'apods:weight',
  scopes: 'apods:scopes',
  priority: 'apods:priority',
  name: 'apods:name',
  description: 'apods:description',
  icon: 'apods:icon',
  category: 'apods:category',
  value: 'apods:value',
  schemaVersion: 'apods:schemaVersion',
  updatedAt: 'dc:modified',
  createdAt: 'dc:created'
};

const RESOURCE_TYPE_BY_CONTAINER = {
  filters: 'apods:Filter',
  blocks: 'apods:Block',
  mutes: 'apods:Mute',
  preferences: 'apods:Preference',
  'app-consents': 'apods:AppConsent',
  'trust-sources': 'apods:TrustSource'
};

const RESOURCE_CLASS_URI_BY_CONTAINER = {
  filters: 'https://activitypods.org/ns/core#Filter',
  blocks: 'https://activitypods.org/ns/core#Block',
  mutes: 'https://activitypods.org/ns/core#Mute',
  preferences: 'https://activitypods.org/ns/core#Preference',
  'app-consents': 'https://activitypods.org/ns/core#AppConsent',
  'trust-sources': 'https://activitypods.org/ns/core#TrustSource'
};

const MRF_TRACE_QUERY_KEYS = new Set([
  'cursor',
  'limit',
  'moduleId',
  'action',
  'originHost',
  'activityId',
  'dateFrom',
  'dateTo',
  'includePrivate'
]);

const MRF_METRICS_QUERY_KEYS = new Set(['from', 'to', 'moduleId', 'action', 'originHost', 'maxItems']);

const MODERATION_QUERY_KEYS = new Set([
  'cursor',
  'limit',
  'source',
  'action',
  'targetAtDid',
  'targetActorUri',
  'targetWebId',
  'status',
  'sourceActorUri',
  'recipientWebId',
  'reportedActorUri',
  'includeRevoked',
  'subject',
  'uriPatterns',
  'sources'
]);

const DEFAULT_AT_LABELS = [
  'porn',
  'sexual',
  'nudity',
  'graphic-media',
  'self-harm',
  'intolerance',
  'misinformation',
  'spam'
];

const ATPROTO_SYNC_PREF_CATEGORY = 'atproto-moderation-sync';
const ATPROTO_MIRROR_TRUST_SOURCE_MARKER = 'atproto-preferences-sync';
const HASHTAG_FOLLOWS_PREF_CATEGORY = 'followed-hashtags-v1';
const HASHTAG_FOLLOWS_VERSION = 'v1';
const HASHTAG_FOLLOWS_MAX = 500;
const HASHTAG_FOLLOWS_IMPORT_MAX_CHARS = 16000;
const HASHTAG_FOLLOWS_IMPORT_MAX_ITEMS = 2000;
const HASHTAG_INPUT_MAX_CHARS = 256;
const DEFAULT_SYNC_INTERVAL_HOURS = 6;
const MIN_SYNC_INTERVAL_HOURS = 1;
const MAX_SYNC_INTERVAL_HOURS = 24;
const ATPROTO_LABELER_DIRECTORY_URL = 'https://www.bluesky-labelers.io/';
const ATPROTO_LABELER_DIRECTORY_CACHE_TTL_MS = 15 * 60 * 1000;
const FEDISEER_MANAGED_RULE_PREFIX = 'fediseer:domain:';
const FEDISEER_DEFAULT_BASE_URL = 'https://fediseer.com';
const FEDISEER_MAX_SYNC_PAGES = 10;
const FEDISEER_PAGE_SIZE = 200;
const PROVIDER_INBOX_EVENTS_MAX = 2000;
const PROVIDER_INBOX_RAW_MAX_CHARS = 32 * 1024;
const PROVIDER_INBOX_EVENT_TYPES = new Set(['UndoFlag', 'Accept', 'Reject', 'Generic']);

module.exports = {
  name: 'user-settings-api',
  dependencies: ['api', 'ldp.container', 'ldp.resource'],

  settings: {
    routePath: '/api/dashboard',
    mrfAdminBaseUrl: (
      process.env.MRF_ADMIN_BASE_URL ||
      process.env.SIDECAR_WEBHOOK_URL ||
      'http://fedify-sidecar:8080'
    ).replace(/\/$/, ''),
    mrfAdminToken: process.env.MRF_ADMIN_TOKEN || '',
    internalBridgeToken:
      process.env.ACTIVITYPODS_TOKEN || process.env.INTERNAL_API_TOKEN || process.env.SIDECAR_TOKEN || '',
    mrfTimeoutMs: Number(process.env.MRF_TIMEOUT_MS) || 5000,
    mrfRetries: Number(process.env.MRF_RETRIES) || 3,
    mrfRetryBaseDelayMs: Number(process.env.MRF_RETRY_BASE_DELAY_MS) || 150,
    mrfRetryMaxDelayMs: Number(process.env.MRF_RETRY_MAX_DELAY_MS) || 2500,
    mrfCircuitFailureThreshold: Number(process.env.MRF_CIRCUIT_FAILURE_THRESHOLD) || 5,
    mrfCircuitResetTimeoutMs: Number(process.env.MRF_CIRCUIT_RESET_TIMEOUT_MS) || 30000,
    providerActorsRaw: process.env.PROVIDER_ACTORS || '',
    providerDataDir: process.env.PROVIDER_DATA_DIR || path.resolve('./data/provider'),
    auditLogMaxEntries: Number(process.env.AUDIT_LOG_MAX_ENTRIES) || 500,
    atprotoAutoSyncSweepMinutes: Math.max(5, Number(process.env.ATPROTO_AUTO_SYNC_SWEEP_MINUTES) || 15),
    atprotoMirrorMinIntervalSeconds: Math.max(30, Number(process.env.ATPROTO_MIRROR_MIN_INTERVAL_SECONDS) || 300),
    atprotoAutoSyncSecret:
      process.env.ATPROTO_SYNC_SECRET_KEY || process.env.ACTIVITYPODS_TOKEN || 'activitypods-dev-sync-key',
    blueskyDefaultLabelerDid: (process.env.BLUESKY_DEFAULT_LABELER_DID || 'did:plc:ar7c4by46qjdydhdevvrndac').trim(),
    blueskyDefaultLabelerHandle: (process.env.BLUESKY_DEFAULT_LABELER_HANDLE || 'moderation.bsky.app').trim(),
    blueskyDefaultLabelerName: (process.env.BLUESKY_DEFAULT_LABELER_NAME || 'Bluesky Moderation Service').trim(),
    // The Bluesky Moderation Service is the pod provider's primary safety layer.
    // It provides CSAM detection, spam filtering, and legal-risk content screening
    // that would otherwise require expensive independent infrastructure.  Disabling
    // it (BLUESKY_DEFAULT_LABELER_ENABLED=false) removes this protection entirely —
    // only do so if you have an equivalent alternative safety provider in place.
    blueskyDefaultLabelerEnabled: process.env.BLUESKY_DEFAULT_LABELER_ENABLED !== 'false',
    pdqHashServiceBaseUrl: (process.env.PDQ_HASH_SERVICE_BASE_URL || '').trim(),
    pdqHashServiceBearerToken: process.env.PDQ_HASH_SERVICE_BEARER_TOKEN || '',
    fediseerBaseUrl: (process.env.FEDISEER_BASE_URL || FEDISEER_DEFAULT_BASE_URL).trim(),
    fediseerApiKey: process.env.FEDISEER_API_KEY || ''
  },

  created() {
    this.providerActors = this.parseProviderActors(this.settings.providerActorsRaw);

    this.mrfCircuit = new CircuitBreaker({
      name: 'mrf-admin-gateway',
      failureThreshold: Math.max(1, this.settings.mrfCircuitFailureThreshold),
      resetTimeoutMs: Math.max(1000, this.settings.mrfCircuitResetTimeoutMs)
    });
    this.reportBridgeCircuit = new CircuitBreaker({
      name: 'canonical-report-bridge',
      failureThreshold: Math.max(1, this.settings.mrfCircuitFailureThreshold),
      resetTimeoutMs: Math.max(1000, this.settings.mrfCircuitResetTimeoutMs)
    });

    // In-memory stores for provider-level data (file-backed on mutations)
    this._announcements = [];
    this._invitations = [];
    this._auditLog = [];
    this._moderationDecisions = [];
    this._moderationCases = [];
    this._providerInboxEvents = [];
    this._atprotoAutoSyncTimer = null;
    this._atprotoAutoSyncInFlight = false;
    this._atprotoMirrorInFlightByWebId = new Set();
    this._atprotoMirrorLastRunByWebId = new Map();
    this._providerDataWriteChains = new Map();
    this._moderationCaseOperationChains = new Map();
    this._providerInboxEventOperationChain = Promise.resolve();
    this._atprotoLabelerDirectoryCache = {
      expiresAt: 0,
      entries: []
    };
    this._atprotoSyncEncryptionKey = crypto
      .createHash('sha256')
      .update(String(this.settings.atprotoAutoSyncSecret || ''), 'utf8')
      .digest();
  },

  async started() {
    if (!this.settings.mrfAdminToken) {
      this.logger.warn('[Dashboard/MRF] MRF_ADMIN_TOKEN is not set - MRF control endpoints will return 503');
    }

    // Load persisted provider data from disk
    this._announcements = await this.loadProviderData('announcements');
    this._invitations = await this.loadProviderData('invitations');
    this._auditLog = await this.loadProviderData('audit-log');
    this._moderationDecisions = await this.loadProviderData('moderation-decisions');
    {
      const normalizedModerationCases = this.normalizeModerationCaseList(
        await this.loadProviderData('moderation-cases')
      );
      this._moderationCases = normalizedModerationCases.entries;
      if (normalizedModerationCases.changed) {
        await this.saveProviderData('moderation-cases', this._moderationCases);
      }
    }
    this._providerInboxEvents = await this.loadProviderData('provider-inbox-events');

    await this.broker.call('api.addRoute', {
      route: {
        path: this.settings.routePath,
        authorization: true,
        authentication: true,
        aliases: {
          'GET /whoami': 'user-settings-api.whoami',
          'GET /mrf/registry': 'user-settings-api.mrfRegistryList',
          'GET /mrf/registry/:moduleId': 'user-settings-api.mrfRegistryItem',
          'GET /mrf/modules': 'user-settings-api.mrfModulesList',
          'GET /mrf/modules/:moduleId': 'user-settings-api.mrfModulesItem',
          'PATCH /mrf/modules/:moduleId': 'user-settings-api.mrfModulesPatch',
          'GET /mrf/chain': 'user-settings-api.mrfChainGet',
          'PATCH /mrf/chain': 'user-settings-api.mrfChainPatch',
          'GET /mrf/traces': 'user-settings-api.mrfTracesList',
          'GET /mrf/traces/:traceId': 'user-settings-api.mrfTraceItem',
          'GET /mrf/traces/:traceId/chain': 'user-settings-api.mrfTraceChain',
          'GET /mrf/traces/:traceId/suggestions': 'user-settings-api.mrfTraceSuggestions',
          'POST /mrf/simulations': 'user-settings-api.mrfSimulationCreate',
          'GET /mrf/simulations/:jobId': 'user-settings-api.mrfSimulationItem',
          'GET /mrf/metrics': 'user-settings-api.mrfMetrics',
          // Spam domain reputation blocklist
          'GET /spam/domains': 'user-settings-api.spamDomainList',
          'POST /spam/domains': 'user-settings-api.spamDomainAdd',
          'DELETE /spam/domains': 'user-settings-api.spamDomainRemove',
          // Provider-only platform management routes
          'GET /provider/stats': 'user-settings-api.providerStats',
          'GET /provider/pods': 'user-settings-api.providerListPods',
          'GET /provider/announcements': 'user-settings-api.listAnnouncements',
          'POST /provider/announcements': 'user-settings-api.createAnnouncement',
          'DELETE /provider/announcements/:id': 'user-settings-api.deleteAnnouncement',
          'GET /provider/invitations': 'user-settings-api.listInvitations',
          'POST /provider/invitations': 'user-settings-api.createInvitation',
          'DELETE /provider/invitations/:id': 'user-settings-api.revokeInvitation',
          'GET /provider/audit-log': 'user-settings-api.listAuditLog',
          'POST /provider/moderation/decisions': 'user-settings-api.applyModerationDecision',
          'GET /provider/moderation/decisions': 'user-settings-api.listModerationDecisions',
          'DELETE /provider/moderation/decisions/:id': 'user-settings-api.revokeModerationDecision',
          'GET /provider/moderation/cases': 'user-settings-api.listModerationCases',
          'PATCH /provider/moderation/cases/:id': 'user-settings-api.updateModerationCaseStatus',
          'POST /provider/moderation/cases/:id/forwarding/retry': 'user-settings-api.retryModerationCaseForwarding',
          'GET /provider/moderation/inbox-events': 'user-settings-api.listProviderInboxEvents',
          'GET /provider/moderation/labels': 'user-settings-api.listAtLabels',
          'GET /provider/moderation/labels/known': 'user-settings-api.listKnownAtLabels',
          'GET /provider/moderation/default-source': 'user-settings-api.providerDefaultModerationSourceStatus',
          'GET /provider/moderation/pdq/status': 'user-settings-api.getPdqHashStatus',
          'POST /provider/moderation/pdq/hash': 'user-settings-api.lookupPdqHash',
          'GET /provider/moderation/fediseer/status': 'user-settings-api.getFediseerStatus',
          'POST /provider/moderation/fediseer/sync': 'user-settings-api.syncFediseerDomainSignals',
          'POST /moderation/reports': 'user-settings-api.createModerationReport',
          'GET /moderation/cases': 'user-settings-api.listOwnerModerationCases',
          'GET /moderation/cases/:id': 'user-settings-api.getOwnerModerationCase',
          'GET /moderation/decisions': 'user-settings-api.listOwnerModerationDecisions',
          'POST /moderation/atproto/lists/fetch': 'user-settings-api.fetchAtprotoUserLists',
          'POST /moderation/atproto/lists/sync': 'user-settings-api.syncAtprotoUserLists',
          'GET /moderation/atproto/labelers/catalog': 'user-settings-api.listAtprotoLabelerCatalog',
          'GET /moderation/atproto/sync/config': 'user-settings-api.getAtprotoSyncConfig',
          'POST /moderation/atproto/sync/config': 'user-settings-api.setAtprotoSyncConfig',
          'POST /moderation/atproto/sync/run': 'user-settings-api.runAtprotoSyncNow',
          'GET /moderation/atproto/resolve-handle': 'user-settings-api.resolveAtprotoHandle',
          'GET /moderation/summary/monthly': 'user-settings-api.monthlyModerationSummary',
          'POST /moderation/summary/monthly/send': 'user-settings-api.sendMonthlyModerationSummary',
          'GET /settings/preview': 'user-settings-api.preview',
          'GET /settings/dashboard-role': 'user-settings-api.dashboardRole',
          'GET /settings/:container': 'user-settings-api.list',
          'POST /settings/:container': 'user-settings-api.create',
          'PUT /settings': 'user-settings-api.update',
          'PATCH /settings': 'user-settings-api.update',
          'DELETE /settings': 'user-settings-api.remove',
          'POST /settings/delete': 'user-settings-api.remove',
          'GET /hashtags/follows': 'user-settings-api.listFollowedHashtags',
          'POST /hashtags/follows': 'user-settings-api.followHashtag',
          'DELETE /hashtags/follows': 'user-settings-api.unfollowHashtag',
          'POST /hashtags/follows/import': 'user-settings-api.importFollowedHashtags',
          'GET /app-consents': 'user-settings-api.listAppConsents',
          'POST /app-consents': 'user-settings-api.createAppConsent',
          // OIDC app-facing moderation filters API (delegated access via app-consents)
          'GET /apps/moderation/preferences': 'user-settings-api.listAppModerationPreferences',
          'POST /apps/moderation/preferences': 'user-settings-api.createAppModerationPreference',
          'PUT /apps/moderation/preferences': 'user-settings-api.updateAppModerationPreference',
          'DELETE /apps/moderation/preferences': 'user-settings-api.removeAppModerationPreference',
          'GET /apps/moderation/trust-sources': 'user-settings-api.listAppTrustSources',
          'POST /apps/moderation/trust-sources': 'user-settings-api.createAppTrustSource',
          'PUT /apps/moderation/trust-sources': 'user-settings-api.updateAppTrustSource',
          'DELETE /apps/moderation/trust-sources': 'user-settings-api.removeAppTrustSource',
          'GET /apps/moderation/blocks': 'user-settings-api.listAppModerationBlocks',
          'POST /apps/moderation/blocks': 'user-settings-api.createAppModerationBlock',
          'GET /apps/moderation/mutes': 'user-settings-api.listAppModerationMutes',
          'POST /apps/moderation/mutes': 'user-settings-api.createAppModerationMute',
          'GET /apps/moderation/filters': 'user-settings-api.listAppModerationFilters',
          'POST /apps/moderation/filters': 'user-settings-api.createAppModerationFilter',
          'PUT /apps/moderation/filters': 'user-settings-api.updateAppModerationFilter',
          'DELETE /apps/moderation/filters': 'user-settings-api.removeAppModerationFilter'
        }
      }
    });

    this._atprotoAutoSyncTimer = setInterval(
      () => {
        this.runAtprotoAutoSyncSweep().catch(err => {
          this.logger.warn('[ATProtoSync] Auto-sync sweep failed: %s', err.message);
        });
      },
      this.settings.atprotoAutoSyncSweepMinutes * 60 * 1000
    );
  },

  async stopped() {
    if (this._atprotoAutoSyncTimer) {
      clearInterval(this._atprotoAutoSyncTimer);
      this._atprotoAutoSyncTimer = null;
    }

    if (this._providerDataWriteChains?.size) {
      await Promise.allSettled([...this._providerDataWriteChains.values()]);
      this._providerDataWriteChains.clear();
    }

    if (this._moderationCaseOperationChains?.size) {
      await Promise.allSettled([...this._moderationCaseOperationChains.values()]);
      this._moderationCaseOperationChains.clear();
    }

    if (this._providerInboxEventOperationChain) {
      await this._providerInboxEventOperationChain.catch(() => undefined);
      this._providerInboxEventOperationChain = Promise.resolve();
    }
  },

  actions: {
    async whoami(ctx) {
      const webId = this.requireWebId(ctx);
      const isProvider = this.isProviderActor(webId);

      return {
        webId,
        isProvider,
        dashboards: {
          owner: true,
          provider: isProvider
        }
      };
    },

    async dashboardRole(ctx) {
      return this.actions.whoami(ctx);
    },

    async mrfRegistryList(ctx) {
      return this.mrfProxy(ctx, {
        method: 'GET',
        path: '/internal/admin/mrf/registry',
        permission: 'provider:read'
      });
    },

    async mrfRegistryItem(ctx) {
      const moduleId = this.sanitizePathSegment(ctx.params.moduleId, 'moduleId');
      return this.mrfProxy(ctx, {
        method: 'GET',
        path: `/internal/admin/mrf/registry/${encodeURIComponent(moduleId)}`,
        permission: 'provider:read'
      });
    },

    async mrfModulesList(ctx) {
      return this.mrfProxy(ctx, {
        method: 'GET',
        path: '/internal/admin/mrf/modules',
        permission: 'provider:read'
      });
    },

    async mrfModulesItem(ctx) {
      const moduleId = this.sanitizePathSegment(ctx.params.moduleId, 'moduleId');
      return this.mrfProxy(ctx, {
        method: 'GET',
        path: `/internal/admin/mrf/modules/${encodeURIComponent(moduleId)}`,
        permission: 'provider:read'
      });
    },

    async mrfModulesPatch(ctx) {
      const moduleId = this.sanitizePathSegment(ctx.params.moduleId, 'moduleId');
      const body = this.requirePlainObject(ctx.params.data, 'data');
      return this.mrfProxy(ctx, {
        method: 'PATCH',
        path: `/internal/admin/mrf/modules/${encodeURIComponent(moduleId)}`,
        permission: 'provider:write',
        body
      });
    },

    async mrfChainGet(ctx) {
      return this.mrfProxy(ctx, {
        method: 'GET',
        path: '/internal/admin/mrf/chain',
        permission: 'provider:read'
      });
    },

    async mrfChainPatch(ctx) {
      const body = this.requirePlainObject(ctx.params.data, 'data');
      return this.mrfProxy(ctx, {
        method: 'PATCH',
        path: '/internal/admin/mrf/chain',
        permission: 'provider:write',
        body
      });
    },

    async mrfTracesList(ctx) {
      const query = this.pickAllowedTraceQuery(ctx.meta.$query || {});
      const queryString = new URLSearchParams(query).toString();
      const path = queryString ? `/internal/admin/mrf/traces?${queryString}` : '/internal/admin/mrf/traces';

      return this.mrfProxy(ctx, {
        method: 'GET',
        path,
        permission: 'provider:read'
      });
    },

    async mrfTraceItem(ctx) {
      const traceId = this.sanitizePathSegment(ctx.params.traceId, 'traceId');
      const includePrivate = String(ctx.meta.$query?.includePrivate || '').toLowerCase() === 'true';
      const path = includePrivate
        ? `/internal/admin/mrf/traces/${encodeURIComponent(traceId)}?includePrivate=true`
        : `/internal/admin/mrf/traces/${encodeURIComponent(traceId)}`;

      return this.mrfProxy(ctx, {
        method: 'GET',
        path,
        permission: 'provider:read'
      });
    },

    async mrfTraceChain(ctx) {
      const traceId = this.sanitizePathSegment(ctx.params.traceId, 'traceId');
      const includePrivate = String(ctx.meta.$query?.includePrivate || '').toLowerCase() === 'true';
      const path = includePrivate
        ? `/internal/admin/mrf/traces/${encodeURIComponent(traceId)}/chain?includePrivate=true`
        : `/internal/admin/mrf/traces/${encodeURIComponent(traceId)}/chain`;

      return this.mrfProxy(ctx, {
        method: 'GET',
        path,
        permission: 'provider:read'
      });
    },

    async mrfTraceSuggestions(ctx) {
      const traceId = this.sanitizePathSegment(ctx.params.traceId, 'traceId');
      return this.mrfProxy(ctx, {
        method: 'GET',
        path: `/internal/admin/mrf/traces/${encodeURIComponent(traceId)}/suggestions`,
        permission: 'provider:read'
      });
    },

    async mrfSimulationCreate(ctx) {
      const body = this.requirePlainObject(ctx.params.data, 'data');
      return this.mrfProxy(ctx, {
        method: 'POST',
        path: '/internal/admin/mrf/simulations',
        permission: 'provider:simulate',
        body
      });
    },

    async mrfSimulationItem(ctx) {
      const jobId = this.sanitizePathSegment(ctx.params.jobId, 'jobId');
      return this.mrfProxy(ctx, {
        method: 'GET',
        path: `/internal/admin/mrf/simulations/${encodeURIComponent(jobId)}`,
        permission: 'provider:simulate'
      });
    },

    async mrfMetrics(ctx) {
      const query = this.pickAllowedMetricsQuery(ctx.meta.$query || {});
      const queryString = new URLSearchParams(query).toString();
      const path = queryString ? `/internal/admin/mrf/metrics?${queryString}` : '/internal/admin/mrf/metrics';

      return this.mrfProxy(ctx, {
        method: 'GET',
        path,
        permission: 'provider:read'
      });
    },

    // ─── Spam domain reputation blocklist ────────────────────────────────────

    async spamDomainList(ctx) {
      return this.mrfProxy(ctx, {
        method: 'GET',
        path: '/internal/admin/spam/domains',
        permission: 'provider:read'
      });
    },

    async spamDomainAdd(ctx) {
      const data = ctx.params.data || ctx.params;
      const { domain, subdomainMatch } = data;
      return this.mrfProxy(ctx, {
        method: 'POST',
        path: '/internal/admin/spam/domains',
        permission: 'provider:write',
        body: { domain, subdomainMatch: subdomainMatch === true }
      });
    },

    async spamDomainRemove(ctx) {
      const data = ctx.params.data || ctx.params;
      const { domain, subdomainMatch } = data;
      return this.mrfProxy(ctx, {
        method: 'DELETE',
        path: '/internal/admin/spam/domains',
        permission: 'provider:write',
        body: { domain, subdomainMatch: subdomainMatch === true }
      });
    },

    // ─── Provider platform management actions (Mastodon/Akkoma-inspired) ───

    async providerStats(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      const now = new Date();
      const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
      const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();

      let totalPods = 0;
      let newThisWeek = 0;
      let newThisMonth = 0;

      try {
        const accounts = await ctx.call('auth.account.find');
        totalPods = accounts.length;

        for (const account of accounts) {
          const created = account.createdAt || account['dc:created'] || account.created_at;
          if (created) {
            if (created >= oneWeekAgo) newThisWeek++;
            if (created >= oneMonthAgo) newThisMonth++;
          }
        }
      } catch (err) {
        this.logger.warn('[Dashboard/Stats] Could not fetch account list:', err.message);
      }

      let mrfSummary = null;
      try {
        const metricsResult = await this.mrfProxyRaw({
          method: 'GET',
          path: '/internal/admin/mrf/metrics',
          permission: 'provider:read'
        });
        mrfSummary = metricsResult?.totals ?? null;
      } catch {
        // MRF metrics unavailable — not critical
      }

      return {
        pods: { total: totalPods, newThisWeek, newThisMonth },
        announcements: this._announcements.length,
        activeInvitations: this._invitations.filter(
          i => !i.revoked && (!i.expiresAt || i.expiresAt > now.toISOString())
        ).length,
        mrf: mrfSummary
      };
    },

    async providerListPods(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      let accounts = [];
      try {
        accounts = await ctx.call('auth.account.find');
      } catch (err) {
        throw new MoleculerError(`Could not fetch pod list: ${err.message}`, 502, 'UPSTREAM_ERROR');
      }

      const pods = accounts
        .filter(a => !a.tombstone)
        .map(a => ({
          webId: a.webId || a['@id'],
          username: a.username || a.preferredUsername,
          email: a.email,
          createdAt: a.createdAt || a['dc:created'] || a.created_at,
          suspended: a.suspended === true || a.deactivated === true
        }))
        .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      return { data: pods, total: pods.length };
    },

    async listAnnouncements(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);
      return { data: [...this._announcements].reverse() };
    },

    async createAnnouncement(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      const { content, startsAt, endsAt, allDay } = ctx.params.data || ctx.params;
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        throw new MoleculerError('content is required', 400, 'VALIDATION_ERROR');
      }
      if (content.length > 5000) {
        throw new MoleculerError('content must be 5000 characters or fewer', 400, 'VALIDATION_ERROR');
      }

      const now = new Date().toISOString();
      const announcement = {
        id: ulid(),
        content: content.trim(),
        startsAt: startsAt || null,
        endsAt: endsAt || null,
        allDay: allDay === true,
        publishedAt: now,
        createdAt: now,
        createdBy: webId
      };

      this._announcements.push(announcement);
      await this.saveProviderData('announcements', this._announcements);
      this.recordAuditEvent(webId, 'create_announcement', { id: announcement.id });

      return { data: announcement };
    },

    async deleteAnnouncement(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      const id = this.sanitizePathSegment(ctx.params.id, 'id');
      const before = this._announcements.length;
      this._announcements = this._announcements.filter(a => a.id !== id);

      if (this._announcements.length === before) {
        throw new MoleculerError('Announcement not found', 404, 'NOT_FOUND');
      }

      await this.saveProviderData('announcements', this._announcements);
      this.recordAuditEvent(webId, 'delete_announcement', { id });

      return { deleted: true };
    },

    async listInvitations(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);
      return { data: [...this._invitations].reverse() };
    },

    async createInvitation(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      const { maxUses, expiresAt, note } = ctx.params.data || ctx.params;

      if (maxUses !== undefined && maxUses !== null) {
        const n = Number(maxUses);
        if (!Number.isInteger(n) || n < 1 || n > 1000) {
          throw new MoleculerError('maxUses must be an integer between 1 and 1000', 400, 'VALIDATION_ERROR');
        }
      }

      if (expiresAt !== undefined && expiresAt !== null) {
        if (typeof expiresAt !== 'string' || isNaN(new Date(expiresAt).getTime())) {
          throw new MoleculerError('expiresAt must be a valid ISO 8601 datetime string', 400, 'VALIDATION_ERROR');
        }
        if (new Date(expiresAt) <= new Date()) {
          throw new MoleculerError('expiresAt must be in the future', 400, 'VALIDATION_ERROR');
        }
      }

      const token = crypto.randomBytes(20).toString('hex');
      const now = new Date().toISOString();
      const invitation = {
        id: ulid(),
        token,
        maxUses: maxUses ? Number(maxUses) : null,
        uses: 0,
        expiresAt: expiresAt || null,
        note: note ? String(note).slice(0, 500) : null,
        revoked: false,
        createdAt: now,
        createdBy: webId
      };

      this._invitations.push(invitation);
      await this.saveProviderData('invitations', this._invitations);
      this.recordAuditEvent(webId, 'create_invitation', { id: invitation.id, maxUses: invitation.maxUses });

      return { data: invitation };
    },

    async revokeInvitation(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      const id = this.sanitizePathSegment(ctx.params.id, 'id');
      const inv = this._invitations.find(i => i.id === id);

      if (!inv) {
        throw new MoleculerError('Invitation not found', 404, 'NOT_FOUND');
      }

      inv.revoked = true;
      inv.revokedAt = new Date().toISOString();
      inv.revokedBy = webId;

      await this.saveProviderData('invitations', this._invitations);
      this.recordAuditEvent(webId, 'revoke_invitation', { id });

      return { data: inv };
    },

    async listAuditLog(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      const limit = Math.min(Number(ctx.meta.$query?.limit) || 100, 500);
      const entries = [...this._auditLog].reverse().slice(0, limit);

      return { data: entries, total: this._auditLog.length };
    },

    async applyModerationDecision(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      const input = ctx.params.data || ctx.params || {};
      const allowedActions = new Set(['label', 'warn', 'filter', 'block', 'suspend']);

      const action = typeof input.action === 'string' ? input.action.trim() : '';
      if (!allowedActions.has(action)) {
        throw new MoleculerError('Invalid moderation action', 400, 'VALIDATION_ERROR');
      }

      const targetWebId = typeof input.targetWebId === 'string' ? input.targetWebId.trim() : undefined;
      const targetActorUri = typeof input.targetActorUri === 'string' ? input.targetActorUri.trim() : undefined;
      let targetAtDid = typeof input.targetAtDid === 'string' ? input.targetAtDid.trim() : undefined;
      const targetHandle = typeof input.targetHandle === 'string' ? input.targetHandle.trim() : undefined;
      const sourceCaseId = typeof input.sourceCaseId === 'string' ? input.sourceCaseId.trim() : undefined;

      if (!targetWebId && !targetActorUri && !targetAtDid && !targetHandle) {
        throw new MoleculerError(
          'targetWebId, targetActorUri, targetAtDid, or targetHandle is required',
          400,
          'VALIDATION_ERROR'
        );
      }

      const labels = Array.isArray(input.labels)
        ? [
            ...new Set(
              input.labels
                .filter(v => typeof v === 'string')
                .map(v => v.trim())
                .filter(Boolean)
            )
          ].slice(0, 20)
        : [];
      const reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 500) : undefined;

      if (!targetAtDid && targetHandle) {
        try {
          const resolved = await this.resolveAtprotoHandleValue(targetHandle);
          if (resolved?.did) {
            targetAtDid = resolved.did;
          }
        } catch (err) {
          if (!targetWebId && !targetActorUri) {
            throw err;
          }
        }
      }

      const payload = {
        targetWebId,
        targetActorUri,
        targetAtDid,
        targetHandle,
        sourceCaseId,
        action,
        labels,
        reason
      };

      const upstream = await this.mrfProxy(ctx, {
        method: 'POST',
        path: '/internal/admin/moderation/decisions',
        permission: 'provider:write',
        body: payload
      });

      const decision = upstream?.decision || null;
      if (decision) {
        this._moderationDecisions.push(decision);
        const max = this.settings.auditLogMaxEntries;
        if (this._moderationDecisions.length > max) {
          this._moderationDecisions = this._moderationDecisions.slice(-max);
        }
        await this.saveProviderData('moderation-decisions', this._moderationDecisions);
        if (sourceCaseId) {
          const existingCase = this.findStoredModerationCaseById(sourceCaseId);
          if (existingCase) {
            const updatedCase = await this.patchStoredModerationCase(sourceCaseId, {
              status: 'resolved',
              updatedAt: decision.appliedAt,
              resolvedAt: decision.appliedAt,
              resolvedBy: webId,
              relatedDecisionIds: [
                ...new Set([
                  ...(Array.isArray(existingCase.relatedDecisionIds) ? existingCase.relatedDecisionIds : []),
                  decision.id
                ])
              ]
            });
            if (updatedCase) {
              await this.emitModerationCaseUpdateNotifications(ctx, existingCase, updatedCase);
            }
          }
        }
        await this.emitModerationDecisionNotification(ctx, decision, 'applied');
      }

      this.recordAuditEvent(webId, 'moderation_apply', {
        action,
        targetWebId: targetWebId || null,
        targetActorUri: targetActorUri || null,
        targetAtDid: targetAtDid || null,
        targetHandle: targetHandle || null,
        labels
      });

      return upstream;
    },

    async createModerationReport(ctx) {
      const webId = this.requireWebId(ctx);
      const input = this.requirePlainObject(ctx.params?.data || ctx.params || {}, 'data');
      const created = await this.createLocalModerationReport(ctx, webId, input);

      this.recordAuditEvent(webId, 'moderation_report_create', {
        caseId: created.case.id,
        source: created.case.source,
        subjectKind: created.case.subject.kind,
        authoritativeProtocol: created.case.subject.authoritativeProtocol || null,
        canonicalPublished: created.canonicalPublished
      });
      await this.emitModerationReportCreatedNotification(ctx, created.case);

      return {
        data: created.case,
        duplicate: created.duplicate,
        canonicalPublished: created.canonicalPublished,
        canonicalIntentId: created.canonicalIntentId || null
      };
    },

    async listOwnerModerationCases(ctx) {
      const webId = this.requireWebId(ctx);
      const query = this.pickModerationQuery(ctx.meta.$query || ctx.params?.query || ctx.params || {});
      return this.buildOwnerModerationCasePage(webId, query);
    },

    async getOwnerModerationCase(ctx) {
      const webId = this.requireWebId(ctx);
      const id = this.sanitizePathSegment(ctx.params.id, 'id');
      const entry = this.findStoredModerationCaseById(id);
      if (!entry || !this.caseBelongsToReporter(entry, webId)) {
        throw new MoleculerError('Moderation case not found', 404, 'NOT_FOUND');
      }
      return { data: entry };
    },

    async listOwnerModerationDecisions(ctx) {
      const webId = this.requireWebId(ctx);
      const query = this.pickModerationQuery(ctx.meta.$query || ctx.params?.query || ctx.params || {});
      return await this.buildOwnerModerationDecisionPage(ctx, webId, query);
    },

    async listModerationCases(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      const query = this.pickModerationQuery(ctx.meta.$query || {});
      return this.buildModerationCaseCachePage(query);
    },

    async updateModerationCaseStatus(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      const id = this.sanitizePathSegment(ctx.params.id, 'id');
      const input = this.requirePlainObject(ctx.params?.data || ctx.params || {}, 'data');
      const VALID_STATUS = new Set(['open', 'dismissed']);
      if (typeof input.status !== 'string' || !VALID_STATUS.has(input.status)) {
        throw new MoleculerError('status must be open or dismissed', 400, 'VALIDATION_ERROR');
      }

      const upstream = await this.mrfProxy(ctx, {
        method: 'PATCH',
        path: `/internal/admin/moderation/cases/${encodeURIComponent(id)}`,
        permission: 'provider:write',
        body: { status: input.status }
      });

      if (upstream?.case) {
        await this.patchStoredModerationCase(id, { status: input.status });
        this.recordAuditEvent(webId, 'moderation_case_status_update', { caseId: id, status: input.status });
      }

      return upstream;
    },

    async retryModerationCaseForwarding(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      const id = this.sanitizePathSegment(ctx.params.id, 'id');
      const input = this.requirePlainObject(ctx.params?.data || ctx.params || {}, 'data');

      return this.enqueueModerationCaseOperation(id, async () => {
        const existingCase = this.findStoredModerationCaseById(id);
        if (!existingCase) {
          throw new MoleculerError('Moderation case not found', 404, 'NOT_FOUND');
        }

        const eligibleProtocols = this.getModerationCaseRetryProtocols(existingCase);
        if (eligibleProtocols.length === 0) {
          throw new MoleculerError(
            'This moderation case does not have a remote authoritative protocol to forward',
            400,
            'MODERATION_FORWARDING_NOT_AVAILABLE'
          );
        }

        const protocols = this.normalizeModerationForwardingRetryProtocols(input.protocols, eligibleProtocols);
        const invalidProtocol = protocols.find(protocol => !eligibleProtocols.includes(protocol));
        if (invalidProtocol) {
          throw new MoleculerError(
            `${invalidProtocol} forwarding is not valid for this moderation case`,
            400,
            'MODERATION_FORWARDING_PROTOCOL_INVALID'
          );
        }

        const currentResults = this.buildModerationForwardingRetryResults(existingCase, protocols);
        const enableRemoteForwarding = input.enableRemoteForwarding === true;

        let caseRecord = existingCase;
        if (!caseRecord.requestedForwarding?.remote) {
          if (!enableRemoteForwarding) {
            throw new MoleculerError(
              'Remote forwarding was not requested for this report. Enable it explicitly before retrying.',
              400,
              'MODERATION_FORWARDING_NOT_REQUESTED'
            );
          }

          caseRecord =
            (await this.patchStoredModerationCase(id, {
              requestedForwarding: { remote: true },
              updatedAt: new Date().toISOString()
            })) || caseRecord;
        }

        const pendingOrDelivered =
          protocols.length > 0 &&
          protocols.every(protocol => {
            const result = currentResults[protocol];
            return result?.status === 'pending' || result?.status === 'already-forwarded';
          });
        if (pendingOrDelivered) {
          this.recordAuditEvent(webId, 'moderation_case_forward_retry_noop', {
            caseId: id,
            protocols,
            enableRemoteForwarding
          });
          return {
            data: caseRecord,
            results: currentResults,
            changed: false
          };
        }

        try {
          const upstream = await this.mrfProxy(ctx, {
            method: 'POST',
            path: `/internal/admin/moderation/cases/${encodeURIComponent(id)}/forwarding/retry`,
            permission: 'provider:write',
            body: { protocols }
          });

          const results = this.normalizeModerationForwardingRetryResultMap(
            upstream?.results && typeof upstream.results === 'object' ? upstream.results : currentResults,
            protocols
          );
          const refreshedCase = this.findStoredModerationCaseById(id) || caseRecord;

          this.recordAuditEvent(webId, 'moderation_case_forward_retry', {
            caseId: id,
            protocols,
            enableRemoteForwarding,
            results
          });

          return {
            data: refreshedCase,
            results,
            changed: true
          };
        } catch (error) {
          this.recordAuditEvent(webId, 'moderation_case_forward_retry_failed', {
            caseId: id,
            protocols,
            enableRemoteForwarding,
            error: error?.message || 'unknown_error'
          });
          throw error;
        }
      });
    },

    async ingestModerationCaseInternal(ctx) {
      const input = this.requirePlainObject(ctx.params || {}, 'case');
      return this.ingestStoredModerationCase(input);
    },

    async getModerationCaseInternal(ctx) {
      const id = this.sanitizePathSegment(ctx.params.id, 'id');
      const entry = this.findStoredModerationCaseById(id);
      if (!entry) {
        throw new MoleculerError('Moderation case not found', 404, 'NOT_FOUND');
      }
      return { case: entry };
    },

    async findModerationCaseByDedupeInternal(ctx) {
      const dedupeKey = this.requireModerationCaseDedupeKey(ctx.params?.dedupeKey);
      const entry = this.findStoredModerationCaseByDedupe(dedupeKey);
      if (!entry) {
        throw new MoleculerError('Moderation case not found', 404, 'NOT_FOUND');
      }
      return { case: entry };
    },

    async listModerationCasesInternal(ctx) {
      const query = this.pickModerationQuery(ctx.params?.query || ctx.params || {});
      const page = this.buildModerationCaseCachePage(query);
      return {
        cases: page.data,
        cursor: page.cursor || undefined
      };
    },

    async patchModerationCaseInternal(ctx) {
      const id = this.sanitizePathSegment(ctx.params.id, 'id');
      const patch = this.requirePlainObject(ctx.params?.patch || {}, 'patch');
      const existing = this.findStoredModerationCaseById(id);
      const updated = await this.patchStoredModerationCase(id, patch);
      if (!updated) {
        throw new MoleculerError('Moderation case not found', 404, 'NOT_FOUND');
      }
      await this.emitModerationCaseUpdateNotifications(ctx, existing, updated);
      return { case: updated };
    },

    async prepareModerationCaseAtprotoForwardingInternal(ctx) {
      const id = this.sanitizePathSegment(ctx.params.id, 'id');
      const input = this.requirePlainObject(ctx.params || {}, 'params');
      const caseRecord = this.findStoredModerationCaseById(id);
      if (!caseRecord) {
        throw new MoleculerError('Moderation case not found', 404, 'NOT_FOUND');
      }

      const canonicalIntentId = this.normalizeOptionalTrimmedString(input.canonicalIntentId, 512);
      return {
        case: caseRecord,
        plan: await this.buildAtprotoModerationForwardingPlan(ctx, caseRecord, {
          canonicalIntentId: canonicalIntentId || undefined
        })
      };
    },

    async ingestProviderInboxEventInternal(ctx) {
      const input = this.requirePlainObject(ctx.params || {}, 'event');
      return this.enqueueProviderInboxEventOperation(() => this.ingestStoredProviderInboxEvent(input));
    },

    async listProviderInboxEventsInternal(ctx) {
      const rawLimit = parseInt(String((ctx.params || {}).limit || (ctx.meta?.$query || {}).limit || 100), 10);
      const limit = Math.min(Math.max(1, isNaN(rawLimit) ? 100 : rawLimit), 500);
      const events = Array.isArray(this._providerInboxEvents) ? this._providerInboxEvents : [];
      return { events: events.slice(0, limit), total: events.length };
    },

    async listProviderInboxEvents(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);
      return this.actions.listProviderInboxEventsInternal(ctx);
    },

    async listModerationDecisions(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      const query = this.pickModerationQuery(ctx.meta.$query || {});
      try {
        const qs = new URLSearchParams(query).toString();
        const path = qs ? `/internal/admin/moderation/decisions?${qs}` : '/internal/admin/moderation/decisions';

        const upstream = await this.mrfProxy(ctx, {
          method: 'GET',
          path,
          permission: 'provider:read'
        });

        return {
          data: upstream?.decisions || [],
          cursor: upstream?.cursor || null
        };
      } catch (err) {
        this.logger.warn('[ModerationBridge] Falling back to local decision cache: %s', err.message);
        return this.buildModerationDecisionCachePage(query);
      }
    },

    async revokeModerationDecision(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      const id = this.sanitizePathSegment(ctx.params.id, 'id').toUpperCase();
      const upstream = await this.mrfProxy(ctx, {
        method: 'DELETE',
        path: `/internal/admin/moderation/decisions/${encodeURIComponent(id)}`,
        permission: 'provider:write'
      });

      const decision = upstream?.decision;
      if (decision?.id) {
        this._moderationDecisions = this._moderationDecisions.map(existing =>
          existing.id === decision.id ? decision : existing
        );
        await this.saveProviderData('moderation-decisions', this._moderationDecisions);
        if (decision.sourceCaseId) {
          const hasActiveSibling = this._moderationDecisions.some(
            existing =>
              existing?.sourceCaseId === decision.sourceCaseId &&
              existing?.id !== decision.id &&
              existing?.revoked !== true
          );
          const existingCase = this.findStoredModerationCaseById(decision.sourceCaseId);
          if (existingCase) {
            const updatedCase = await this.patchStoredModerationCase(decision.sourceCaseId, {
              status: hasActiveSibling ? 'resolved' : 'open',
              updatedAt: decision.revokedAt || new Date().toISOString(),
              resolvedAt: hasActiveSibling ? existingCase?.resolvedAt : null,
              resolvedBy: hasActiveSibling ? existingCase?.resolvedBy : null
            });
            if (updatedCase) {
              await this.emitModerationCaseUpdateNotifications(ctx, existingCase, updatedCase);
            }
          }
        }
        await this.emitModerationDecisionNotification(ctx, decision, 'revoked');
      }

      this.recordAuditEvent(webId, 'moderation_revoke', { id });
      return upstream;
    },

    async listAtLabels(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      const query = this.pickModerationQuery(ctx.meta.$query || {});
      const qs = new URLSearchParams(query).toString();
      const path = qs ? `/internal/admin/moderation/labels?${qs}` : '/internal/admin/moderation/labels';

      return this.mrfProxy(ctx, {
        method: 'GET',
        path,
        permission: 'provider:read'
      });
    },

    async listKnownAtLabels(ctx) {
      this.requireWebId(ctx);

      try {
        return await this.mrfProxy(ctx, {
          method: 'GET',
          path: '/internal/admin/moderation/at-labels/known',
          permission: 'provider:read'
        });
      } catch {
        return {
          data: DEFAULT_AT_LABELS.map(name => ({ name, source: 'builtin' })),
          source: 'builtin'
        };
      }
    },

    async providerDefaultModerationSourceStatus(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      await this.ensureDefaultBlueskyTrustSource(ctx, webId);
      const trustSources = await this.listByContainer(ctx, webId, 'trust-sources', { seedProviderDefaults: false });
      const entry = trustSources.find(item => this.isDefaultBlueskyTrustSource(item));

      return {
        data: {
          exists: Boolean(entry),
          immutable: true,
          source: entry?.source || this.settings.blueskyDefaultLabelerDid,
          sourceType: entry?.sourceType || 'atproto-labeler',
          enabled: entry?.enabled !== false,
          name: entry?.name || this.settings.blueskyDefaultLabelerName,
          handle: this.settings.blueskyDefaultLabelerHandle,
          did: this.settings.blueskyDefaultLabelerDid,
          scopes: Array.isArray(entry?.scopes)
            ? entry.scopes
            : ['label:content', 'label:actor', 'filter:content', 'filter:actor']
        }
      };
    },

    async getPdqHashStatus(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      return {
        data: {
          configured: Boolean(this.settings.pdqHashServiceBaseUrl),
          serviceBaseUrl: this.settings.pdqHashServiceBaseUrl || null,
          hasBearerToken: Boolean(this.settings.pdqHashServiceBearerToken)
        }
      };
    },

    async lookupPdqHash(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      const input = ctx.params?.data || ctx.params || {};
      const imageUrl = this.normalizeHttpUrl(input.imageUrl, 'imageUrl');
      const result = await this.fetchPdqHashFromService(imageUrl);

      this.recordAuditEvent(webId, 'moderation_pdq_lookup', {
        imageUrl,
        quality: result.quality
      });

      return {
        data: {
          imageUrl,
          pdqHashBinary: result.pdqHashBinary,
          quality: result.quality
        }
      };
    },

    async getFediseerStatus(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      return {
        data: {
          configured: Boolean(this.settings.fediseerBaseUrl),
          serviceBaseUrl: this.settings.fediseerBaseUrl || null,
          hasApiKey: Boolean(this.settings.fediseerApiKey),
          sourceDomains: await this.getFediseerSourceDomainsForWebId(ctx, webId)
        }
      };
    },

    async syncFediseerDomainSignals(ctx) {
      const webId = this.requireWebId(ctx);
      this.requireProvider(webId);

      const input = ctx.params?.data || ctx.params || {};
      const apply = input.apply !== false;
      const replaceExisting = input.replaceExisting !== false;
      const includeCensures = input.includeCensures !== false;
      const includeHesitations = input.includeHesitations !== false;
      const censureAction = input.censureAction === 'filter' ? 'filter' : 'reject';
      const hesitationAction = input.hesitationAction === 'reject' ? 'reject' : 'filter';

      if (!includeCensures && !includeHesitations) {
        throw new MoleculerError('Select at least one Fediseer signal to import', 400, 'FEDISEER_SIGNAL_REQUIRED');
      }

      const sourceDomains = this.normalizeFediseerSourceDomains(
        Array.isArray(input.sourceDomains) ? input.sourceDomains : input.sourceDomains ? [input.sourceDomains] : []
      );
      const effectiveSourceDomains =
        sourceDomains.length > 0 ? sourceDomains : await this.getFediseerSourceDomainsForWebId(ctx, webId);

      if (effectiveSourceDomains.length === 0) {
        throw new MoleculerError(
          'Add at least one enabled Fediseer trust source or provide sourceDomains explicitly',
          400,
          'FEDISEER_SOURCE_REQUIRED'
        );
      }

      const maxPages = this.clampInt(input.maxPages, 3, 1, FEDISEER_MAX_SYNC_PAGES);
      const censureEntries = includeCensures
        ? await this.fetchFediseerSignalEntries('censures_given', effectiveSourceDomains, 'censure', maxPages)
        : [];
      const hesitationEntries = includeHesitations
        ? await this.fetchFediseerSignalEntries('hesitations_given', effectiveSourceDomains, 'hesitation', maxPages)
        : [];
      const aggregatedEntries = this.aggregateFediseerSignalEntries([...censureEntries, ...hesitationEntries], {
        censureAction,
        hesitationAction
      });

      let applied = null;
      if (apply) {
        applied = await this.applyFediseerRules(ctx, webId, aggregatedEntries, {
          replaceExisting
        });
      }

      this.recordAuditEvent(webId, 'moderation_fediseer_sync', {
        apply,
        replaceExisting,
        sourceDomains: effectiveSourceDomains,
        importedDomains: aggregatedEntries.length,
        includeCensures,
        includeHesitations
      });

      return {
        data: {
          apply,
          replaceExisting,
          sourceDomains: effectiveSourceDomains,
          signals: {
            censures: censureEntries.length,
            hesitations: hesitationEntries.length
          },
          entries: aggregatedEntries,
          applied
        }
      };
    },

    async resolveAtprotoHandle(ctx) {
      this.requireWebId(ctx);

      const resolved = await this.resolveAtprotoHandleValue(
        ctx.params?.handle || ctx.meta?.$query?.handle || '',
        ctx.params?.pdsUrl || ctx.meta?.$query?.pdsUrl
      );

      return {
        data: {
          handle: resolved.handle,
          did: resolved.did
        }
      };
    },

    async fetchAtprotoUserLists(ctx) {
      const webId = this.requireWebId(ctx);
      const input = ctx.params?.data || ctx.params || {};
      const binding = await this.getAtprotoBindingForWebId(ctx, webId);
      const credentials = await this.resolveAtprotoSyncCredentials(ctx, webId, input, binding);
      const pdsUrl = credentials.pdsUrl;
      const limit = this.clampInt(input.limit, 50, 1, 100);
      const maxPages = this.clampInt(input.maxPages, 5, 1, 20);

      const session =
        credentials.mode === 'managed-internal'
          ? await this.createManagedAtprotoSession(pdsUrl, webId)
          : await this.createAtprotoSession(pdsUrl, credentials.identifier, credentials.password);
      const mutes = await this.fetchAtprotoPagedList({
        pdsUrl,
        accessJwt: session.accessJwt,
        path: '/xrpc/app.bsky.graph.getMutes',
        listField: 'mutes',
        limit,
        maxPages
      });
      const blocks = await this.fetchAtprotoPagedList({
        pdsUrl,
        accessJwt: session.accessJwt,
        path: '/xrpc/app.bsky.graph.getBlocks',
        listField: 'blocks',
        limit,
        maxPages
      });

      return {
        data: {
          pdsUrl,
          did: binding.atprotoDid,
          handle: binding.atprotoHandle,
          mutes,
          blocks,
          fetchedAt: new Date().toISOString()
        }
      };
    },

    async syncAtprotoUserLists(ctx) {
      const webId = this.requireWebId(ctx);
      const input = ctx.params?.data || ctx.params || {};
      const replace = Boolean(input.replace);

      const fetched = await this.actions.fetchAtprotoUserLists(
        {
          data: {
            identifier: input.identifier,
            password: input.password,
            pdsUrl: input.pdsUrl,
            limit: input.limit,
            maxPages: input.maxPages
          }
        },
        {
          parentCtx: ctx,
          meta: ctx.meta
        }
      );

      const muteIds = fetched.data.mutes.map(item => this.extractAtprotoSubjectId(item)).filter(Boolean);
      const blockIds = fetched.data.blocks.map(item => this.extractAtprotoSubjectId(item)).filter(Boolean);

      const mutesResult = await this.syncAtprotoSubjectsIntoContainer(ctx, webId, 'mutes', muteIds, replace);
      const blocksResult = await this.syncAtprotoSubjectsIntoContainer(ctx, webId, 'blocks', blockIds, replace);

      return {
        data: {
          fetchedAt: fetched.data.fetchedAt,
          pdsUrl: fetched.data.pdsUrl,
          mutes: {
            remoteCount: fetched.data.mutes.length,
            ...mutesResult
          },
          blocks: {
            remoteCount: fetched.data.blocks.length,
            ...blocksResult
          }
        }
      };
    },

    async getAtprotoSyncConfig(ctx) {
      const webId = this.requireWebId(ctx);
      const config = await this.getAtprotoSyncConfigValue(ctx, webId);
      return {
        data: this.publicAtprotoSyncConfig(config)
      };
    },

    async listAtprotoLabelerCatalog(ctx) {
      const webId = this.requireWebId(ctx);
      return {
        data: await this.buildAtprotoLabelerCatalog(ctx, webId)
      };
    },

    async setAtprotoSyncConfig(ctx) {
      const webId = this.requireWebId(ctx);
      const input = ctx.params?.data || ctx.params || {};
      const existing = await this.getAtprotoSyncConfigValue(ctx, webId);

      const enabled = input.enabled === undefined ? existing.enabled : Boolean(input.enabled);
      const replaceMode = input.replace === undefined ? existing.replace : Boolean(input.replace);
      const intervalHours = this.clampInt(
        input.intervalHours === undefined ? existing.intervalHours : input.intervalHours,
        DEFAULT_SYNC_INTERVAL_HOURS,
        MIN_SYNC_INTERVAL_HOURS,
        MAX_SYNC_INTERVAL_HOURS
      );

      const binding = await this.getAtprotoBindingForWebId(ctx, webId);
      const pdsUrl = this.normalizeHttpUrlOrDefault(
        input.pdsUrl || existing.pdsUrl || binding.atprotoPdsUrl,
        binding.atprotoPdsUrl
      );
      const identifier = input.identifier
        ? this.requireAtprotoIdentifier(input.identifier)
        : existing.identifier || binding.atprotoHandle || binding.atprotoDid || '';

      const next = {
        enabled,
        replace: replaceMode,
        intervalHours,
        pdsUrl,
        identifier,
        encryptedSecret: existing.encryptedSecret || null,
        updatedAt: new Date().toISOString(),
        lastSyncAt: existing.lastSyncAt || null,
        lastSyncError: existing.lastSyncError || null
      };

      if (Object.prototype.hasOwnProperty.call(input, 'password')) {
        if (typeof input.password === 'string' && input.password.trim().length > 0) {
          next.encryptedSecret = this.encryptAtprotoSecret(input.password.trim());
        } else if (input.password === null || input.password === '') {
          next.encryptedSecret = null;
        }
      }

      await this.upsertAtprotoSyncConfig(ctx, webId, next);

      return {
        data: this.publicAtprotoSyncConfig(next)
      };
    },

    async runAtprotoSyncNow(ctx) {
      const webId = this.requireWebId(ctx);
      const input = ctx.params?.data || ctx.params || {};

      const result = await this.performConfiguredAtprotoSync(ctx, webId, {
        reason: input.reason || 'manual',
        force: true
      });

      return {
        data: result
      };
    },

    async monthlyModerationSummary(ctx) {
      const webId = this.requireWebId(ctx);
      const summary = await this.buildMonthlyModerationSummary(ctx, webId);
      return {
        data: {
          ...summary,
          deliveryEnabled: await this.isMonthlySummaryEnabled(ctx, webId)
        }
      };
    },

    async sendMonthlyModerationSummary(ctx) {
      const webId = this.requireWebId(ctx);
      const force = Boolean(ctx.params?.force);
      const result = await this.dispatchMonthlyModerationSummaryInternal(ctx, webId, { force, reason: 'manual' });

      return {
        data: result
      };
    },

    async dispatchMonthlyModerationSummary(ctx) {
      const webId = this.requireWebIdParam(ctx.params?.webId);
      const force = Boolean(ctx.params?.force);
      const reason = this.normalizeStringOrDefault(ctx.params?.reason, 'scheduled');

      return this.dispatchMonthlyModerationSummaryInternal(ctx, webId, { force, reason });
    },

    async list(ctx) {
      const webId = this.requireWebId(ctx);
      const c = this.requireContainer(ctx.params.container);
      return { data: await this.listByContainer(ctx, webId, c) };
    },

    async create(ctx) {
      const webId = this.requireWebId(ctx);
      const c = this.requireContainer(ctx.params.container);
      const { data, error: validationError } = prepareForContainer(c, ctx.params.data || {});

      if (validationError) throw new MoleculerError(validationError, 400, 'VALIDATION_ERROR');

      const uri = this.dataContainer(webId);

      const now = new Date().toISOString();
      const type = this.resourceTypeForContainer(c);

      const resource = {
        '@context': CONTEXT,
        type,
        createdAt: now,
        updatedAt: now,
        ...data
      };

      const resourceUri = await ctx.call('ldp.container.post', {
        containerUri: uri,
        resource,
        contentType: JSON_LD,
        webId
      });

      const created = await ctx.call('ldp.resource.get', {
        resourceUri,
        webId,
        accept: JSON_LD,
        jsonContext: CONTEXT
      });

      return { data: created };
    },

    async update(ctx) {
      const webId = this.requireWebId(ctx);
      const { resourceUri, data } = ctx.params;

      if (!resourceUri?.startsWith(this.dataContainer(webId))) {
        throw new MoleculerError('Forbidden', 403);
      }

      const existing = await ctx.call('ldp.resource.get', {
        resourceUri,
        webId,
        accept: JSON_LD,
        jsonContext: CONTEXT
      });

      const container = this.containerForResource(existing);
      if (!container) {
        throw new MoleculerError('Unknown resource type', 400, 'VALIDATION_ERROR');
      }

      if (container === 'trust-sources' && this.isProviderActor(webId) && this.isDefaultBlueskyTrustSource(existing)) {
        throw new MoleculerError(
          'The default Bluesky moderation trust source is immutable and cannot be modified',
          403,
          'TRUST_SOURCE_IMMUTABLE'
        );
      }

      this.assertImmutableFields(existing, data || {}, container);

      const candidate = {
        ...existing,
        ...data,
        updatedAt: new Date().toISOString()
      };

      const { data: next, error: validationError } = prepareForContainer(container, candidate);
      if (validationError) throw new MoleculerError(validationError, 400, 'VALIDATION_ERROR');

      await ctx.call('ldp.resource.put', {
        resourceUri,
        resource: next,
        contentType: JSON_LD,
        webId
      });

      return { data: next };
    },

    async remove(ctx) {
      const webId = this.requireWebId(ctx);
      const resourceUri = ctx.params.resourceUri || ctx.meta.$query?.resourceUri;

      if (!resourceUri) throw new MoleculerError('resourceUri is required', 400);

      // Ownership guard: resource must live inside the caller's data container
      if (!resourceUri.startsWith(this.dataContainer(webId))) {
        throw new MoleculerError('Forbidden', 403);
      }

      const existing = await ctx.call('ldp.resource.get', {
        resourceUri,
        webId,
        accept: JSON_LD,
        jsonContext: CONTEXT
      });
      const container = this.containerForResource(existing);
      if (container === 'trust-sources' && this.isProviderActor(webId) && this.isDefaultBlueskyTrustSource(existing)) {
        throw new MoleculerError(
          'The default Bluesky moderation trust source is immutable and cannot be removed',
          403,
          'TRUST_SOURCE_IMMUTABLE'
        );
      }

      const dataset = getDatasetFromUri(webId);
      await ctx.call('ldp.resource.delete', { resourceUri, webId }, { meta: { dataset } });

      return { deleted: true };
    },

    async preview(ctx) {
      this.requireWebId(ctx);
      const url = ctx.params.url || ctx.meta.$query?.url;
      if (!url || typeof url !== 'string') throw new MoleculerError('url is required', 400);

      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        throw new MoleculerError('Invalid URL', 400);
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new MoleculerError('Only http/https URLs are supported', 400);
      }

      let body;
      try {
        const response = await fetch(url, {
          headers: { Accept: 'application/activity+json, application/ld+json;q=0.9, application/json;q=0.8' },
          redirect: 'follow',
          timeout: 5000
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        body = await response.json();
      } catch (err) {
        throw new MoleculerError(`Preview fetch failed: ${err.message}`, 502);
      }

      const get = (...keys) => {
        for (const k of keys) {
          const v = body[k];
          if (v && typeof v === 'string') return v;
          if (v?.url && typeof v.url === 'string') return v.url;
        }
        return undefined;
      };

      return {
        name: get('name', 'preferredUsername'),
        description: get('summary', 'description', 'content'),
        icon: get('icon')
      };
    },

    async listAppConsents(ctx) {
      const webId = this.requireWebId(ctx);
      return { data: await this.listByContainer(ctx, webId, 'app-consents') };
    },

    async createAppConsent(ctx) {
      const webId = this.requireWebId(ctx);
      const { data: consentData, error: validationError } = prepareAppConsent(ctx.params.data || {});

      if (validationError) throw new MoleculerError(validationError, 400, 'VALIDATION_ERROR');

      const uri = this.dataContainer(webId);
      const now = new Date().toISOString();

      const resource = {
        '@context': CONTEXT,
        type: this.resourceTypeForContainer('app-consents'),
        createdAt: now,
        updatedAt: now,
        ...consentData
      };

      const resourceUri = await ctx.call('ldp.container.post', {
        containerUri: uri,
        resource,
        contentType: JSON_LD,
        webId
      });

      const created = await ctx.call('ldp.resource.get', {
        resourceUri,
        webId,
        accept: JSON_LD,
        jsonContext: CONTEXT
      });

      return { data: created };
    },

    async listAppModerationPreferences(ctx) {
      const delegated = await this.requireDelegatedModerationAccess(ctx, 'read:moderation');
      return { data: await this.listByContainer(ctx, delegated.ownerWebId, 'preferences') };
    },

    async createAppModerationPreference(ctx) {
      const delegated = await this.requireDelegatedModerationAccess(ctx, 'write:moderation');

      return ctx.call(
        'user-settings-api.create',
        {
          container: 'preferences',
          data: ctx.params.data || {}
        },
        {
          meta: {
            webId: delegated.ownerWebId
          }
        }
      );
    },

    async updateAppModerationPreference(ctx) {
      const delegated = await this.requireDelegatedModerationAccess(ctx, 'write:moderation');

      return ctx.call(
        'user-settings-api.update',
        {
          resourceUri: ctx.params.resourceUri,
          data: ctx.params.data || {}
        },
        {
          meta: {
            webId: delegated.ownerWebId
          }
        }
      );
    },

    async removeAppModerationPreference(ctx) {
      const delegated = await this.requireDelegatedModerationAccess(ctx, 'write:moderation');

      return ctx.call(
        'user-settings-api.remove',
        {
          resourceUri: ctx.params.resourceUri || ctx.meta?.$query?.resourceUri
        },
        {
          meta: {
            webId: delegated.ownerWebId
          }
        }
      );
    },

    async listAppTrustSources(ctx) {
      const delegated = await this.requireDelegatedModerationAccess(ctx, ['read:trust', 'read:moderation']);
      return {
        data: await this.listByContainer(ctx, delegated.ownerWebId, 'trust-sources', {
          seedProviderDefaults: false,
          skipAtprotoMirror: true
        })
      };
    },

    async createAppTrustSource(ctx) {
      const delegated = await this.requireDelegatedModerationAccess(ctx, ['write:trust', 'write:moderation']);

      return ctx.call(
        'user-settings-api.create',
        {
          container: 'trust-sources',
          data: ctx.params.data || {}
        },
        {
          meta: {
            webId: delegated.ownerWebId
          }
        }
      );
    },

    async updateAppTrustSource(ctx) {
      const delegated = await this.requireDelegatedModerationAccess(ctx, ['write:trust', 'write:moderation']);

      return ctx.call(
        'user-settings-api.update',
        {
          resourceUri: ctx.params.resourceUri,
          data: ctx.params.data || {}
        },
        {
          meta: {
            webId: delegated.ownerWebId
          }
        }
      );
    },

    async removeAppTrustSource(ctx) {
      const delegated = await this.requireDelegatedModerationAccess(ctx, ['write:trust', 'write:moderation']);

      return ctx.call(
        'user-settings-api.remove',
        {
          resourceUri: ctx.params.resourceUri || ctx.meta?.$query?.resourceUri
        },
        {
          meta: {
            webId: delegated.ownerWebId
          }
        }
      );
    },

    async listAppModerationBlocks(ctx) {
      const delegated = await this.requireDelegatedModerationAccess(ctx, 'read:moderation');
      return { data: await this.listByContainer(ctx, delegated.ownerWebId, 'blocks') };
    },

    async createAppModerationBlock(ctx) {
      const delegated = await this.requireDelegatedModerationAccess(ctx, 'write:moderation');

      return ctx.call(
        'user-settings-api.create',
        {
          container: 'blocks',
          data: ctx.params.data || {}
        },
        {
          meta: {
            webId: delegated.ownerWebId
          }
        }
      );
    },

    async listAppModerationMutes(ctx) {
      const delegated = await this.requireDelegatedModerationAccess(ctx, 'read:moderation');
      return { data: await this.listByContainer(ctx, delegated.ownerWebId, 'mutes') };
    },

    async createAppModerationMute(ctx) {
      const delegated = await this.requireDelegatedModerationAccess(ctx, 'write:moderation');

      return ctx.call(
        'user-settings-api.create',
        {
          container: 'mutes',
          data: ctx.params.data || {}
        },
        {
          meta: {
            webId: delegated.ownerWebId
          }
        }
      );
    },

    async listAppModerationFilters(ctx) {
      const delegated = await this.requireDelegatedModerationAccess(ctx, 'read:moderation');

      return { data: await this.listByContainer(ctx, delegated.ownerWebId, 'filters') };
    },

    async createAppModerationFilter(ctx) {
      const delegated = await this.requireDelegatedModerationAccess(ctx, 'write:moderation');

      return ctx.call(
        'user-settings-api.create',
        {
          container: 'filters',
          data: ctx.params.data || {}
        },
        {
          meta: {
            webId: delegated.ownerWebId
          }
        }
      );
    },

    async updateAppModerationFilter(ctx) {
      const delegated = await this.requireDelegatedModerationAccess(ctx, 'write:moderation');

      return ctx.call(
        'user-settings-api.update',
        {
          resourceUri: ctx.params.resourceUri,
          data: ctx.params.data || {}
        },
        {
          meta: {
            webId: delegated.ownerWebId
          }
        }
      );
    },

    async removeAppModerationFilter(ctx) {
      const delegated = await this.requireDelegatedModerationAccess(ctx, 'write:moderation');

      return ctx.call(
        'user-settings-api.remove',
        {
          resourceUri: ctx.params.resourceUri || ctx.meta?.$query?.resourceUri
        },
        {
          meta: {
            webId: delegated.ownerWebId
          }
        }
      );
    },

    async listFollowedHashtags(ctx) {
      const webId = this.requireWebId(ctx);
      const canonicalAccountId = await this.resolveCanonicalAccountId(ctx, webId);
      const hashtags = await this.getFollowedHashtags(ctx, webId);

      return {
        data: {
          canonicalAccountId,
          version: HASHTAG_FOLLOWS_VERSION,
          hashtags
        }
      };
    },

    async followHashtag(ctx) {
      const webId = this.requireWebId(ctx);
      const canonicalAccountId = await this.resolveCanonicalAccountId(ctx, webId);
      const input = this.requirePlainObject(ctx.params?.data || ctx.params || {}, 'data');
      const normalizedTag = this.normalizeFollowedHashtagInput(input.tag || input.hashtag);
      const options = this.normalizeHashtagFollowOptions(input.options || input);

      const hashtags = await this.upsertFollowedHashtag(ctx, webId, normalizedTag, options);

      return {
        data: {
          canonicalAccountId,
          hashtag: normalizedTag,
          hashtags
        }
      };
    },

    async unfollowHashtag(ctx) {
      const webId = this.requireWebId(ctx);
      const canonicalAccountId = await this.resolveCanonicalAccountId(ctx, webId);
      const fromData = this.requirePlainObject(ctx.params?.data || {}, 'data');
      const rawTag = fromData.tag || fromData.hashtag || ctx.meta?.$query?.tag || ctx.meta?.$query?.hashtag;
      const normalizedTag = this.normalizeFollowedHashtagInput(rawTag);

      const hashtags = await this.removeFollowedHashtag(ctx, webId, normalizedTag);

      return {
        data: {
          canonicalAccountId,
          hashtag: normalizedTag,
          hashtags
        }
      };
    },

    async importFollowedHashtags(ctx) {
      const webId = this.requireWebId(ctx);
      const canonicalAccountId = await this.resolveCanonicalAccountId(ctx, webId);
      const input = this.requirePlainObject(ctx.params?.data || ctx.params || {}, 'data');
      const parsed = this.parseHashtagFollowImportInput(input.tags);
      const replace = Boolean(input.replace);

      let hashtags = replace ? [] : await this.getFollowedHashtags(ctx, webId);
      const existingByTag = new Map(hashtags.map(item => [String(item.tag || '').toLowerCase(), item]));
      let added = 0;

      for (const rawTag of parsed) {
        const normalizedTag = this.normalizeFollowedHashtagInput(rawTag);
        const key = normalizedTag.toLowerCase();
        if (existingByTag.has(key)) continue;

        const next = {
          tag: normalizedTag,
          displayTag: `#${normalizedTag}`,
          notify: true,
          includeCrossProtocol: true,
          includeRelated: true,
          createdAt: new Date().toISOString()
        };

        existingByTag.set(key, next);
        added += 1;
      }

      hashtags = this.enforceFollowedHashtagLimit([...existingByTag.values()]);
      await this.setFollowedHashtags(ctx, webId, hashtags);

      return {
        data: {
          canonicalAccountId,
          added,
          total: hashtags.length,
          hashtags
        }
      };
    }
  },

  methods: {
    requireModerationCaseDedupeKey(value) {
      const dedupeKey = String(value || '').trim();
      if (!/^[a-f0-9]{32,128}$/i.test(dedupeKey)) {
        throw new MoleculerError('dedupeKey must be a hex digest', 400, 'VALIDATION_ERROR');
      }
      return dedupeKey.toLowerCase();
    },

    inferModerationReasonType(reason) {
      const normalized = String(reason || '').toLowerCase();
      if (!normalized) return 'other';
      if (/\b(spam|scam|bot|phishing)\b/.test(normalized)) return 'spam';
      if (/\b(harass|abuse|threat|stalk|bully)\b/.test(normalized)) return 'harassment';
      return 'other';
    },

    normalizeModerationReasonType(value) {
      const normalized = String(value || '')
        .trim()
        .toLowerCase();
      if (
        ['spam', 'harassment', 'abuse', 'impersonation', 'copyright', 'illegal', 'safety', 'other'].includes(normalized)
      ) {
        return normalized;
      }
      throw new MoleculerError('reasonType is invalid', 400, 'VALIDATION_ERROR');
    },

    normalizeModerationActorRef(value, fieldName, options = {}) {
      if (value === undefined || value === null) {
        if (options.allowEmpty) return null;
        throw new MoleculerError(`${fieldName} is required`, 400, 'VALIDATION_ERROR');
      }
      if (typeof value !== 'object' || Array.isArray(value)) {
        throw new MoleculerError(`${fieldName} must be an object`, 400, 'VALIDATION_ERROR');
      }

      const canonicalAccountId = this.normalizeOptionalTrimmedString(value.canonicalAccountId, 512);
      const did = this.normalizeOptionalTrimmedString(value.did, 512);
      const webId = this.normalizeOptionalHttpUrl(value.webId);
      const activityPubActorUri = this.normalizeOptionalHttpUrl(value.activityPubActorUri);
      const handle = this.normalizeOptionalTrimmedString(value.handle, 512);

      const actor = {
        ...(canonicalAccountId ? { canonicalAccountId } : {}),
        ...(did ? { did } : {}),
        ...(webId ? { webId } : {}),
        ...(activityPubActorUri ? { activityPubActorUri } : {}),
        ...(handle ? { handle } : {})
      };

      if (Object.keys(actor).length === 0) {
        if (options.allowEmpty) return null;
        throw new MoleculerError(`${fieldName} must include at least one identity`, 400, 'VALIDATION_ERROR');
      }

      return actor;
    },

    normalizeModerationObjectRef(value, fieldName) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new MoleculerError(`${fieldName} must be an object`, 400, 'VALIDATION_ERROR');
      }

      const atUri = this.normalizeOptionalTrimmedString(value.atUri, 2048);
      const activityPubObjectId = this.normalizeOptionalHttpUrl(value.activityPubObjectId);
      const canonicalUrl = this.normalizeOptionalHttpUrl(value.canonicalUrl);
      const cid = this.normalizeOptionalTrimmedString(value.cid, 512);
      const canonicalObjectId =
        this.normalizeOptionalTrimmedString(value.canonicalObjectId, 2048) ||
        atUri ||
        activityPubObjectId ||
        canonicalUrl;

      if (!canonicalObjectId) {
        throw new MoleculerError(
          `${fieldName} must include canonicalObjectId, atUri, activityPubObjectId, or canonicalUrl`,
          400,
          'VALIDATION_ERROR'
        );
      }

      return {
        canonicalObjectId,
        ...(atUri ? { atUri } : {}),
        ...(cid ? { cid } : {}),
        ...(activityPubObjectId ? { activityPubObjectId } : {}),
        ...(canonicalUrl ? { canonicalUrl } : {})
      };
    },

    inferModerationSubjectAuthority(subject) {
      if (!subject || typeof subject !== 'object') return 'local';

      if (subject.kind === 'account') {
        const actor = subject.actor || {};
        if (actor.webId || actor.canonicalAccountId) return 'local';
        if (actor.did || actor.handle) return 'at';
        if (actor.activityPubActorUri) return 'ap';
        return 'local';
      }

      if (subject.kind === 'object') {
        const object = subject.object || {};
        if (subject.owner?.webId || subject.owner?.canonicalAccountId) return 'local';
        if (object.atUri) return 'at';
        if (object.activityPubObjectId) return 'ap';
      }

      return 'local';
    },

    normalizeModerationSubject(value, fieldName = 'subject') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new MoleculerError(`${fieldName} is required`, 400, 'VALIDATION_ERROR');
      }

      if (value.kind === 'account') {
        const actor = this.normalizeModerationActorRef(value.actor, `${fieldName}.actor`);
        const authoritativeProtocol = ['local', 'ap', 'at'].includes(value.authoritativeProtocol)
          ? value.authoritativeProtocol
          : this.inferModerationSubjectAuthority({ kind: 'account', actor });
        return {
          kind: 'account',
          actor,
          authoritativeProtocol
        };
      }

      if (value.kind === 'object') {
        const object = this.normalizeModerationObjectRef(value.object, `${fieldName}.object`);
        const owner = value.owner
          ? this.normalizeModerationActorRef(value.owner, `${fieldName}.owner`, { allowEmpty: true })
          : null;
        const authoritativeProtocol = ['local', 'ap', 'at'].includes(value.authoritativeProtocol)
          ? value.authoritativeProtocol
          : this.inferModerationSubjectAuthority({ kind: 'object', object, owner });
        return {
          kind: 'object',
          object,
          ...(owner ? { owner } : {}),
          authoritativeProtocol
        };
      }

      throw new MoleculerError(`${fieldName}.kind must be "account" or "object"`, 400, 'VALIDATION_ERROR');
    },

    normalizeModerationEvidenceObjectRefs(value) {
      if (value === undefined || value === null) return [];
      if (!Array.isArray(value)) {
        throw new MoleculerError('evidenceObjectRefs must be an array', 400, 'VALIDATION_ERROR');
      }
      return value
        .slice(0, 20)
        .map((entry, index) => this.normalizeModerationObjectRef(entry, `evidenceObjectRefs[${index}]`));
    },

    normalizeModerationCanonicalEventState(value) {
      const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      const status = ['pending', 'published', 'failed'].includes(raw.status) ? raw.status : 'pending';
      const canonicalIntentId = this.normalizeOptionalTrimmedString(raw.canonicalIntentId, 512);
      const lastAttemptAt = this.normalizeOptionalIsoTimestamp(raw.lastAttemptAt);
      const publishedAt = this.normalizeOptionalIsoTimestamp(raw.publishedAt);
      const lastError = this.normalizeOptionalTrimmedString(raw.lastError, 1024);

      return {
        status,
        ...(canonicalIntentId ? { canonicalIntentId } : {}),
        ...(lastAttemptAt ? { lastAttemptAt } : {}),
        ...(publishedAt ? { publishedAt } : {}),
        ...(lastError ? { lastError } : {})
      };
    },

    normalizeModerationActivityPubForwardingState(value) {
      const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      const status = ['pending', 'queued', 'delivered', 'failed', 'skipped'].includes(raw.status)
        ? raw.status
        : 'pending';
      const canonicalIntentId = this.normalizeOptionalTrimmedString(raw.canonicalIntentId, 512);
      const moderationActorUri = this.normalizeOptionalHttpUrl(raw.moderationActorUri);
      const activityId = this.normalizeOptionalHttpUrl(raw.activityId);
      const outboxIntentId = this.normalizeOptionalTrimmedString(raw.outboxIntentId, 256);
      const targetActorUri = this.normalizeOptionalHttpUrl(raw.targetActorUri);
      const targetInbox = this.normalizeOptionalHttpUrl(raw.targetInbox);
      const targetDomain = this.normalizeOptionalTrimmedString(raw.targetDomain, 255);
      const lastAttemptAt = this.normalizeOptionalIsoTimestamp(raw.lastAttemptAt);
      const queuedAt = this.normalizeOptionalIsoTimestamp(raw.queuedAt);
      const deliveredAt = this.normalizeOptionalIsoTimestamp(raw.deliveredAt);
      const lastError = this.normalizeOptionalTrimmedString(raw.lastError, 1024);
      const skippedReason = this.normalizeOptionalTrimmedString(raw.skippedReason, 128);
      const lastStatusCode =
        Number.isInteger(raw.lastStatusCode) && raw.lastStatusCode >= 100 && raw.lastStatusCode <= 599
          ? raw.lastStatusCode
          : null;

      return {
        status,
        ...(canonicalIntentId ? { canonicalIntentId } : {}),
        ...(moderationActorUri ? { moderationActorUri } : {}),
        ...(activityId ? { activityId } : {}),
        ...(outboxIntentId ? { outboxIntentId } : {}),
        ...(targetActorUri ? { targetActorUri } : {}),
        ...(targetInbox ? { targetInbox } : {}),
        ...(targetDomain ? { targetDomain } : {}),
        ...(lastAttemptAt ? { lastAttemptAt } : {}),
        ...(queuedAt ? { queuedAt } : {}),
        ...(deliveredAt ? { deliveredAt } : {}),
        ...(lastError ? { lastError } : {}),
        ...(skippedReason ? { skippedReason } : {}),
        ...(lastStatusCode ? { lastStatusCode } : {})
      };
    },

    normalizeModerationAtprotoForwardingState(value) {
      const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      const status = ['pending', 'delivered', 'failed', 'skipped'].includes(raw.status) ? raw.status : 'pending';
      const canonicalIntentId = this.normalizeOptionalTrimmedString(raw.canonicalIntentId, 512);
      const serviceDid = this.normalizeOptionalTrimmedString(raw.serviceDid, 512);
      const pdsUrl = this.normalizeOptionalHttpUrl(raw.pdsUrl);
      const reporterDid = this.normalizeOptionalTrimmedString(raw.reporterDid, 512);
      const reporterHandle = this.normalizeOptionalTrimmedString(raw.reporterHandle, 512);
      const subjectDid = this.normalizeOptionalTrimmedString(raw.subjectDid, 512);
      const subjectAtUri = this.normalizeOptionalTrimmedString(raw.subjectAtUri, 2048);
      const reportId = Number.isInteger(raw.reportId) && raw.reportId >= 0 ? raw.reportId : null;
      const lastAttemptAt = this.normalizeOptionalIsoTimestamp(raw.lastAttemptAt);
      const deliveredAt = this.normalizeOptionalIsoTimestamp(raw.deliveredAt);
      const lastError = this.normalizeOptionalTrimmedString(raw.lastError, 1024);
      const skippedReason = this.normalizeOptionalTrimmedString(raw.skippedReason, 128);
      const lastStatusCode =
        Number.isInteger(raw.lastStatusCode) && raw.lastStatusCode >= 100 && raw.lastStatusCode <= 599
          ? raw.lastStatusCode
          : null;

      return {
        status,
        ...(canonicalIntentId ? { canonicalIntentId } : {}),
        ...(serviceDid ? { serviceDid } : {}),
        ...(pdsUrl ? { pdsUrl } : {}),
        ...(reporterDid ? { reporterDid } : {}),
        ...(reporterHandle ? { reporterHandle } : {}),
        ...(subjectDid ? { subjectDid } : {}),
        ...(subjectAtUri ? { subjectAtUri } : {}),
        ...(reportId !== null ? { reportId } : {}),
        ...(lastAttemptAt ? { lastAttemptAt } : {}),
        ...(deliveredAt ? { deliveredAt } : {}),
        ...(lastError ? { lastError } : {}),
        ...(skippedReason ? { skippedReason } : {}),
        ...(lastStatusCode ? { lastStatusCode } : {})
      };
    },

    normalizeModerationForwardingState(value) {
      const raw = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      const activityPub =
        raw.activityPub && typeof raw.activityPub === 'object'
          ? this.normalizeModerationActivityPubForwardingState(raw.activityPub)
          : null;
      const atproto =
        raw.atproto && typeof raw.atproto === 'object'
          ? this.normalizeModerationAtprotoForwardingState(raw.atproto)
          : null;

      return activityPub || atproto
        ? {
            ...(activityPub ? { activityPub } : {}),
            ...(atproto ? { atproto } : {})
          }
        : null;
    },

    getModerationCaseRetryProtocols(caseRecord) {
      if (!caseRecord || caseRecord.source !== 'local-user-report') return [];

      switch (caseRecord.subject?.authoritativeProtocol) {
        case 'ap':
          return ['activityPub'];
        case 'at':
          return ['atproto'];
        default:
          return [];
      }
    },

    normalizeModerationForwardingRetryProtocols(value, fallback = []) {
      if (value === undefined || value === null) {
        return [...fallback];
      }

      const input = Array.isArray(value) ? value : [value];
      const normalized = [
        ...new Set(
          input
            .filter(entry => typeof entry === 'string')
            .map(entry => entry.trim())
            .filter(entry => entry === 'activityPub' || entry === 'atproto')
        )
      ];

      if (normalized.length === 0) {
        throw new MoleculerError('protocols must include "activityPub" or "atproto"', 400, 'VALIDATION_ERROR');
      }

      return normalized;
    },

    buildModerationForwardingRetryResults(caseRecord, protocols) {
      const results = {};

      for (const protocol of Array.isArray(protocols) ? protocols : []) {
        if (protocol === 'activityPub') {
          const state = caseRecord?.forwarding?.activityPub || null;
          if (state?.status === 'pending' || state?.status === 'queued') {
            results.activityPub = {
              status: 'pending',
              canonicalIntentId: state.canonicalIntentId || undefined,
              reason: 'already_in_progress'
            };
          } else if (state?.status === 'delivered') {
            results.activityPub = {
              status: 'already-forwarded',
              canonicalIntentId: state.canonicalIntentId || undefined,
              reason: 'already_delivered'
            };
          }
          continue;
        }

        if (protocol === 'atproto') {
          const state = caseRecord?.forwarding?.atproto || null;
          if (state?.status === 'pending') {
            results.atproto = {
              status: 'pending',
              canonicalIntentId: state.canonicalIntentId || undefined,
              reason: 'already_in_progress'
            };
          } else if (state?.status === 'delivered') {
            results.atproto = {
              status: 'already-forwarded',
              canonicalIntentId: state.canonicalIntentId || undefined,
              reason: 'already_delivered'
            };
          }
        }
      }

      return results;
    },

    normalizeModerationForwardingRetryResultMap(value, protocols) {
      const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      const normalized = {};

      for (const protocol of Array.isArray(protocols) ? protocols : []) {
        const raw = source[protocol];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const status = this.normalizeOptionalTrimmedString(raw.status, 64);
        if (!['pending', 'ignored', 'skipped', 'queued', 'delivered', 'already-forwarded', 'failed'].includes(status)) {
          continue;
        }

        normalized[protocol] = {
          status,
          ...(this.normalizeOptionalTrimmedString(raw.canonicalIntentId, 512)
            ? { canonicalIntentId: this.normalizeOptionalTrimmedString(raw.canonicalIntentId, 512) }
            : {}),
          ...(this.normalizeOptionalTrimmedString(raw.reason, 128)
            ? { reason: this.normalizeOptionalTrimmedString(raw.reason, 128) }
            : {})
        };
      }

      return normalized;
    },

    normalizeOptionalTrimmedString(value, maxLen = 2048) {
      if (value === undefined || value === null) return null;
      const trimmed = String(value).trim();
      if (!trimmed) return null;
      if (trimmed.length > maxLen) {
        throw new MoleculerError(`Value exceeds maximum length (${maxLen})`, 400, 'VALIDATION_ERROR');
      }
      return trimmed;
    },

    normalizeOptionalIsoTimestamp(value) {
      const candidate = this.normalizeOptionalTrimmedString(value, 128);
      if (!candidate) return null;
      const timestamp = Date.parse(candidate);
      if (Number.isNaN(timestamp)) {
        throw new MoleculerError('Invalid ISO 8601 timestamp', 400, 'VALIDATION_ERROR');
      }
      return new Date(timestamp).toISOString();
    },

    normalizeOptionalHttpUrl(value) {
      const candidate = this.normalizeOptionalTrimmedString(value, 2048);
      if (!candidate) return null;
      try {
        const parsed = new URL(candidate);
        if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
          throw new Error('invalid_url');
        }
        return parsed.toString();
      } catch {
        throw new MoleculerError('Expected a valid http(s) URL', 400, 'VALIDATION_ERROR');
      }
    },

    buildModerationCaseDedupeKey(input) {
      const payload = JSON.stringify({
        source: input.source,
        reporterWebId: input.reporterWebId || null,
        subject: input.subject,
        reasonType: input.reasonType,
        reason: input.reason || null,
        evidenceObjectRefs: (input.evidenceObjectRefs || []).map(ref => ref.canonicalObjectId).sort(),
        requestedForwardingRemote: input.requestedForwarding?.remote === true
      });
      return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
    },

    normalizeModerationCaseRecord(value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new MoleculerError('Moderation case must be an object', 400, 'VALIDATION_ERROR');
      }

      const legacyReportedUris = Array.isArray(value.reportedUris) ? value.reportedUris.filter(Boolean) : [];
      const legacyReportedActorUris = Array.isArray(value.reportedActorUris)
        ? value.reportedActorUris.filter(Boolean)
        : [];
      const subject =
        value.subject && typeof value.subject === 'object'
          ? this.normalizeModerationSubject(value.subject, 'subject')
          : legacyReportedActorUris.length > 0
            ? {
                kind: 'account',
                actor: { activityPubActorUri: String(legacyReportedActorUris[0]).trim() },
                authoritativeProtocol: 'ap'
              }
            : {
                kind: 'object',
                object: this.normalizeModerationObjectRef(
                  {
                    canonicalObjectId:
                      legacyReportedUris[0] || `urn:moderation:case:${String(value.id || '').trim() || ulid()}`
                  },
                  'subject.object'
                ),
                authoritativeProtocol: 'ap'
              };

      const reporter =
        value.reporter && typeof value.reporter === 'object'
          ? this.normalizeModerationActorRef(value.reporter, 'reporter', { allowEmpty: true })
          : value.sourceActorUri
            ? this.normalizeModerationActorRef(
                {
                  activityPubActorUri: value.sourceActorUri,
                  webId: value.sourceActorWebId
                },
                'reporter'
              )
            : null;

      const recipient =
        value.recipient && typeof value.recipient === 'object'
          ? {
              ...(this.normalizeOptionalHttpUrl(value.recipient.webId)
                ? { webId: this.normalizeOptionalHttpUrl(value.recipient.webId) }
                : {}),
              ...(this.normalizeOptionalHttpUrl(value.recipient.activityPubActorUri)
                ? { activityPubActorUri: this.normalizeOptionalHttpUrl(value.recipient.activityPubActorUri) }
                : {})
            }
          : {
              ...(this.normalizeOptionalHttpUrl(value.recipientWebId)
                ? { webId: this.normalizeOptionalHttpUrl(value.recipientWebId) }
                : {}),
              ...(this.normalizeOptionalHttpUrl(value.recipientActorUri)
                ? { activityPubActorUri: this.normalizeOptionalHttpUrl(value.recipientActorUri) }
                : {})
            };

      const evidenceObjectRefs =
        Array.isArray(value.evidenceObjectRefs) && value.evidenceObjectRefs.length > 0
          ? this.normalizeModerationEvidenceObjectRefs(value.evidenceObjectRefs)
          : legacyReportedUris
              .filter(uri => !(subject.kind === 'account' && subject.actor.activityPubActorUri === uri))
              .map(uri =>
                this.normalizeModerationObjectRef(
                  {
                    canonicalObjectId: uri,
                    activityPubObjectId: uri,
                    canonicalUrl: uri
                  },
                  'evidenceObjectRefs[]'
                )
              );

      const reasonType = value.reasonType
        ? this.normalizeModerationReasonType(value.reasonType)
        : this.inferModerationReasonType(value.reason);
      const reason = this.normalizeOptionalTrimmedString(value.reason, 2000);
      const requestedForwarding =
        value.requestedForwarding && typeof value.requestedForwarding === 'object'
          ? { remote: Boolean(value.requestedForwarding.remote) }
          : null;
      const clientContext =
        value.clientContext && typeof value.clientContext === 'object'
          ? {
              ...(this.normalizeOptionalTrimmedString(value.clientContext.app, 128)
                ? { app: this.normalizeOptionalTrimmedString(value.clientContext.app, 128) }
                : {}),
              ...(this.normalizeOptionalTrimmedString(value.clientContext.surface, 128)
                ? { surface: this.normalizeOptionalTrimmedString(value.clientContext.surface, 128) }
                : {})
            }
          : null;
      const id = this.normalizeOptionalTrimmedString(value.id, 256) || ulid().toLowerCase();
      const dedupeKey = value.dedupeKey
        ? this.requireModerationCaseDedupeKey(value.dedupeKey)
        : this.buildModerationCaseDedupeKey({
            source: value.source || 'local-user-report',
            reporterWebId: reporter?.webId || null,
            subject,
            reasonType,
            reason,
            evidenceObjectRefs,
            requestedForwarding
          });
      const notes = this.normalizeModerationCaseNotes(value.notes);

      return {
        id,
        source: value.source === 'activitypub-flag' ? 'activitypub-flag' : 'local-user-report',
        protocol: value.protocol === 'ap' ? 'ap' : 'activitypods',
        ...(this.normalizeOptionalTrimmedString(value.activityId, 2048)
          ? { activityId: this.normalizeOptionalTrimmedString(value.activityId, 2048) }
          : {}),
        dedupeKey,
        ...(reporter ? { reporter } : {}),
        ...(this.normalizeOptionalTrimmedString(value.inboxPath, 2048)
          ? { inboxPath: this.normalizeOptionalTrimmedString(value.inboxPath, 2048) }
          : {}),
        ...(Object.keys(recipient).length > 0 ? { recipient } : {}),
        reasonType,
        ...(reason ? { reason } : {}),
        ...(requestedForwarding ? { requestedForwarding } : {}),
        ...(clientContext && Object.keys(clientContext).length > 0 ? { clientContext } : {}),
        subject,
        evidenceObjectRefs,
        ...(this.normalizeOptionalIsoTimestamp(value.createdAt)
          ? { createdAt: this.normalizeOptionalIsoTimestamp(value.createdAt) }
          : {}),
        receivedAt: this.normalizeOptionalIsoTimestamp(value.receivedAt) || new Date().toISOString(),
        status: ['open', 'resolved', 'dismissed'].includes(value.status) ? value.status : 'open',
        relatedDecisionIds: Array.isArray(value.relatedDecisionIds)
          ? [...new Set(value.relatedDecisionIds.map(item => String(item || '').trim()).filter(Boolean))]
          : [],
        canonicalEvent: this.normalizeModerationCanonicalEventState(value.canonicalEvent),
        ...(notes.length > 0 ? { notes } : {}),
        ...(this.normalizeModerationForwardingState(value.forwarding)
          ? { forwarding: this.normalizeModerationForwardingState(value.forwarding) }
          : {}),
        ...(this.normalizeOptionalIsoTimestamp(value.updatedAt)
          ? { updatedAt: this.normalizeOptionalIsoTimestamp(value.updatedAt) }
          : {}),
        ...(this.normalizeOptionalIsoTimestamp(value.resolvedAt)
          ? { resolvedAt: this.normalizeOptionalIsoTimestamp(value.resolvedAt) }
          : {}),
        ...(this.normalizeOptionalTrimmedString(value.resolvedBy, 2048)
          ? { resolvedBy: this.normalizeOptionalTrimmedString(value.resolvedBy, 2048) }
          : {})
      };
    },

    normalizeModerationCaseNotes(value) {
      if (!Array.isArray(value)) return [];

      return value
        .slice(-100)
        .map(entry => {
          if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;

          const id = this.normalizeOptionalTrimmedString(entry.id, 256) || ulid().toLowerCase();
          const timestamp = this.normalizeOptionalIsoTimestamp(entry.timestamp) || new Date().toISOString();
          const source = this.normalizeOptionalTrimmedString(entry.source, 128) || 'operator-note';
          const content = this.normalizeOptionalTrimmedString(entry.content, 2000);
          if (!content) return null;
          const actorUri = this.normalizeOptionalHttpUrl(entry.actorUri);
          const originalFlagId = this.normalizeOptionalTrimmedString(entry.originalFlagId, 512);

          return {
            id,
            timestamp,
            source,
            content,
            ...(actorUri ? { actorUri } : {}),
            ...(originalFlagId ? { originalFlagId } : {})
          };
        })
        .filter(Boolean);
    },

    normalizeModerationCaseList(entries) {
      const normalized = [];
      let changed = false;
      for (const entry of Array.isArray(entries) ? entries : []) {
        try {
          const next = this.normalizeModerationCaseRecord(entry);
          normalized.push(next);
          if (JSON.stringify(entry) !== JSON.stringify(next)) {
            changed = true;
          }
        } catch (err) {
          changed = true;
          this.logger.warn('[ModerationCases] Dropping invalid case entry: %s', err.message);
        }
      }
      return {
        changed,
        entries: this.sortStoredModerationCases(normalized)
      };
    },

    sortStoredModerationCases(entries) {
      return [...entries]
        .sort((left, right) => {
          const leftTs = Date.parse(left?.receivedAt || left?.updatedAt || 0) || 0;
          const rightTs = Date.parse(right?.receivedAt || right?.updatedAt || 0) || 0;
          return rightTs - leftTs;
        })
        .slice(0, this.settings.auditLogMaxEntries);
    },

    findStoredModerationCaseById(id) {
      const normalizedId = String(id || '').trim();
      return this._moderationCases.find(entry => entry?.id === normalizedId) || null;
    },

    findStoredModerationCaseByDedupe(dedupeKey) {
      const normalizedDedupe = String(dedupeKey || '')
        .trim()
        .toLowerCase();
      return (
        this._moderationCases.find(entry => String(entry?.dedupeKey || '').toLowerCase() === normalizedDedupe) || null
      );
    },

    async replaceStoredModerationCases(entries) {
      this._moderationCases = this.sortStoredModerationCases(entries);
      await this.saveProviderData('moderation-cases', this._moderationCases);
      return this._moderationCases;
    },

    async ingestStoredModerationCase(input) {
      const normalized = this.normalizeModerationCaseRecord(input);
      const duplicate =
        this.findStoredModerationCaseByDedupe(normalized.dedupeKey) || this.findStoredModerationCaseById(normalized.id);
      if (duplicate) {
        return { case: duplicate, duplicate: true };
      }

      await this.replaceStoredModerationCases([normalized, ...this._moderationCases]);
      return { case: normalized, duplicate: false };
    },

    async patchStoredModerationCase(id, patch) {
      const existing = this.findStoredModerationCaseById(id);
      if (!existing) return null;

      const merged = this.normalizeModerationCaseRecord({
        ...existing,
        ...patch,
        reporter:
          patch.reporter && typeof patch.reporter === 'object'
            ? { ...(existing.reporter || {}), ...patch.reporter }
            : existing.reporter,
        recipient:
          patch.recipient && typeof patch.recipient === 'object'
            ? { ...(existing.recipient || {}), ...patch.recipient }
            : existing.recipient,
        canonicalEvent:
          patch.canonicalEvent && typeof patch.canonicalEvent === 'object'
            ? { ...(existing.canonicalEvent || {}), ...patch.canonicalEvent }
            : existing.canonicalEvent,
        forwarding:
          patch.forwarding && typeof patch.forwarding === 'object'
            ? {
                ...(existing.forwarding || {}),
                ...patch.forwarding,
                activityPub:
                  patch.forwarding.activityPub && typeof patch.forwarding.activityPub === 'object'
                    ? {
                        ...((existing.forwarding && existing.forwarding.activityPub) || {}),
                        ...patch.forwarding.activityPub
                      }
                    : patch.forwarding.activityPub === null
                      ? null
                      : existing.forwarding && existing.forwarding.activityPub,
                atproto:
                  patch.forwarding.atproto && typeof patch.forwarding.atproto === 'object'
                    ? {
                        ...((existing.forwarding && existing.forwarding.atproto) || {}),
                        ...patch.forwarding.atproto
                      }
                    : patch.forwarding.atproto === null
                      ? null
                      : existing.forwarding && existing.forwarding.atproto
              }
            : existing.forwarding
      });

      await this.replaceStoredModerationCases(
        this._moderationCases.map(entry => (entry?.id === existing.id ? merged : entry))
      );

      return merged;
    },

    async enqueueModerationCaseOperation(caseId, work) {
      const key = String(caseId || '')
        .trim()
        .toLowerCase();
      const previous = this._moderationCaseOperationChains.get(key) || Promise.resolve();
      const next = previous.catch(() => undefined).then(work);
      const tracked = next.finally(() => {
        if (this._moderationCaseOperationChains.get(key) === tracked) {
          this._moderationCaseOperationChains.delete(key);
        }
      });
      this._moderationCaseOperationChains.set(key, tracked);
      return tracked;
    },

    async enqueueProviderInboxEventOperation(work) {
      const previous = this._providerInboxEventOperationChain || Promise.resolve();
      const next = previous.catch(() => undefined).then(work);
      this._providerInboxEventOperationChain = next.catch(() => undefined);
      return next;
    },

    // ─── Provider inbox events ────────────────────────────────────────────────

    /**
     * Ingest a non-Flag provider-directed AP activity forwarded by the sidecar.
     *
     * Idempotent: a second call with the same activityId returns the existing
     * record without mutating state.
     *
     * For UndoFlag events the original Flag moderation case is patched with a
     * retraction note; ActivityPods (not the sidecar) decides case closure policy.
     * Accept, Reject, and Generic events are stored as raw provider inbox events.
     */
    async ingestStoredProviderInboxEvent(input) {
      // ── Normalize & validate ──────────────────────────────────────────────
      const receivedAt = this.normalizeProviderInboxTimestamp(input.receivedAt);
      const actorUri = this.requireProviderInboxHttpUrl(input.actorUri, 'actorUri');
      const envelopePath = this.normalizeProviderInboxEnvelopePath(input.envelopePath);
      const activityId = this.normalizeProviderInboxToken(input.activityId, 512);
      const objectId = this.normalizeProviderInboxToken(input.objectId, 512);
      const originalFlagId = this.normalizeProviderInboxToken(input.originalFlagId, 512);
      const requestedEventType = this.normalizeProviderInboxToken(input.eventType, 64) || 'Generic';
      const eventType = PROVIDER_INBOX_EVENT_TYPES.has(requestedEventType) ? requestedEventType : 'Generic';
      const activityType =
        eventType === 'Generic'
          ? this.normalizeProviderInboxToken(input.activityType || requestedEventType, 64)
          : eventType;
      const rawActivity = this.normalizeProviderInboxRawActivity(input.rawActivity);

      // ── Idempotency guard ─────────────────────────────────────────────────
      if (activityId) {
        const existing = this._providerInboxEvents.find(e => e.activityId === activityId);
        if (existing) {
          return { event: existing, duplicate: true };
        }
      }

      const eventId = `pie-${ulid()}`;
      const storedAt = new Date().toISOString();

      // ── UndoFlag: patch the originating case ──────────────────────────────
      if (eventType === 'UndoFlag') {
        if (originalFlagId) {
          const matchingCase = this._moderationCases.find(c => {
            const canonicalEventId = c?.canonicalEvent?.sourceEventId;
            return canonicalEventId && String(canonicalEventId).trim() === originalFlagId;
          });

          if (matchingCase) {
            await this.patchStoredModerationCase(matchingCase.id, {
              notes: [
                ...(Array.isArray(matchingCase.notes) ? matchingCase.notes : []),
                {
                  id: eventId,
                  timestamp: storedAt,
                  source: 'activitypub-undo-flag',
                  content: `Reporter retracted original flag (Undo received from ${actorUri}).`,
                  actorUri,
                  originalFlagId
                }
              ]
            });
            this.logger.info('[ProviderInbox] UndoFlag applied to moderation case %s', matchingCase.id);
          } else {
            this.logger.info('[ProviderInbox] UndoFlag received but no matching case found', {
              originalFlagId,
              actorUri
            });
          }
        }
      }

      // ── Persist the raw event ─────────────────────────────────────────────
      const event = {
        id: eventId,
        eventType,
        activityId,
        actorUri,
        envelopePath,
        receivedAt,
        storedAt,
        objectId,
        activityType,
        rawActivity
      };

      this._providerInboxEvents = [event, ...this._providerInboxEvents].slice(0, PROVIDER_INBOX_EVENTS_MAX);
      await this.saveProviderData('provider-inbox-events', this._providerInboxEvents);

      return { event, duplicate: false };
    },

    normalizeProviderInboxToken(value, maxLength) {
      if (value === undefined || value === null) return null;
      const normalized = String(value).trim();
      return normalized ? normalized.slice(0, maxLength) : null;
    },

    requireProviderInboxHttpUrl(value, label) {
      const normalized = this.normalizeProviderInboxToken(value, 2048);
      if (!normalized) {
        throw new MoleculerError(`${label} is required`, 400, 'VALIDATION_ERROR');
      }

      try {
        const parsed = new URL(normalized);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('unsupported_protocol');
        }
        return parsed.toString().slice(0, 2048);
      } catch {
        throw new MoleculerError(`${label} must be an absolute HTTP(S) URL`, 400, 'VALIDATION_ERROR');
      }
    },

    normalizeProviderInboxEnvelopePath(value) {
      const normalized = this.normalizeProviderInboxToken(value, 2048);
      if (!normalized) return null;
      if (normalized.startsWith('/')) return normalized;

      try {
        const parsed = new URL(normalized);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
        return parsed.toString().slice(0, 2048);
      } catch {
        return null;
      }
    },

    normalizeProviderInboxTimestamp(value) {
      const normalized = this.normalizeProviderInboxToken(value, 64);
      if (!normalized) return new Date().toISOString();

      const parsed = new Date(normalized);
      if (Number.isNaN(parsed.getTime())) {
        return new Date().toISOString();
      }
      return parsed.toISOString();
    },

    normalizeProviderInboxRawActivity(value) {
      if (value === undefined || value === null) return null;

      let raw;
      if (typeof value === 'string') {
        raw = value;
      } else {
        try {
          raw = JSON.stringify(value);
        } catch {
          raw = null;
        }
      }

      if (!raw) return null;
      return raw.length > PROVIDER_INBOX_RAW_MAX_CHARS ? raw.slice(0, PROVIDER_INBOX_RAW_MAX_CHARS) : raw;
    },

    async buildCanonicalActorRefForWebId(ctx, webId, canonicalAccountId) {
      const actor = {
        canonicalAccountId: canonicalAccountId || webId,
        webId
      };

      try {
        const binding = await ctx.call('identitybindings.getByCanonicalAccountId', {
          canonicalAccountId
        });

        if (binding?.activityPubActorUri) actor.activityPubActorUri = binding.activityPubActorUri;
        if (binding?.atprotoDid) actor.did = binding.atprotoDid;
        if (binding?.atprotoHandle) actor.handle = binding.atprotoHandle;
      } catch {
        // Keep the WebID-only reporter reference when the binding service is unavailable.
      }

      return actor;
    },

    async publishCanonicalModerationReport(caseRecord) {
      if (!this.settings.mrfAdminBaseUrl || !this.settings.internalBridgeToken) {
        return { ok: false, error: 'not_configured' };
      }

      const execute = async () => {
        const response = await fetch(`${this.settings.mrfAdminBaseUrl}/internal/bridge/moderation/reports`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.settings.internalBridgeToken}`,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
          },
          body: JSON.stringify({
            caseId: caseRecord.id,
            sourceEventId: `activitypods:report:${caseRecord.id}`,
            reporterWebId: caseRecord.reporter?.webId || null,
            sourceAccountRef: caseRecord.reporter || null,
            subject: caseRecord.subject,
            reasonType: caseRecord.reasonType,
            reason: caseRecord.reason || null,
            evidenceObjectRefs: caseRecord.evidenceObjectRefs || [],
            requestedForwarding: caseRecord.requestedForwarding || null,
            clientContext: caseRecord.clientContext || null,
            createdAt: caseRecord.createdAt || caseRecord.receivedAt,
            observedAt: new Date().toISOString()
          }),
          signal: AbortSignal.timeout(this.settings.mrfTimeoutMs)
        });

        const text = await response.text();
        const payload = text ? this.tryParseJson(text) : {};
        if (!response.ok) {
          const error = new MoleculerError(
            payload?.error?.message || `Canonical report bridge failed (${response.status})`,
            response.status,
            payload?.error?.code || 'CANONICAL_REPORT_BRIDGE_FAILED'
          );
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }

        return payload;
      };

      try {
        const payload = await this.reportBridgeCircuit.execute(() =>
          retryWithBackoff(execute, {
            maxRetries: Math.max(0, this.settings.mrfRetries - 1),
            baseDelayMs: Math.max(25, this.settings.mrfRetryBaseDelayMs),
            maxDelayMs: Math.max(this.settings.mrfRetryBaseDelayMs, this.settings.mrfRetryMaxDelayMs),
            deadlineMs: this.settings.mrfTimeoutMs * Math.max(1, this.settings.mrfRetries),
            retryIf: err => err?.retryable !== false
          })
        );
        return {
          ok: true,
          canonicalIntentId: payload?.canonicalIntentId || null
        };
      } catch (err) {
        const message =
          err instanceof CircuitOpenError ? err.message : err?.message || 'canonical_report_bridge_failed';
        this.logger.warn('[ModerationReport] Failed to publish canonical report create event', {
          caseId: caseRecord.id,
          error: message
        });
        return { ok: false, error: message };
      }
    },

    async createLocalModerationReport(ctx, webId, input) {
      const canonicalAccountId = await this.resolveCanonicalAccountId(ctx, webId);
      const reporter = await this.buildCanonicalActorRefForWebId(ctx, webId, canonicalAccountId);
      const subject = this.normalizeModerationSubject(input.subject, 'subject');
      const reasonType = this.normalizeModerationReasonType(input.reasonType);
      const reason = this.normalizeOptionalTrimmedString(input.reason, 2000);
      const evidenceObjectRefs = this.normalizeModerationEvidenceObjectRefs(input.evidenceObjectRefs);
      const requestedForwarding =
        input.requestedForwarding && typeof input.requestedForwarding === 'object'
          ? { remote: Boolean(input.requestedForwarding.remote) }
          : null;
      const clientContext =
        input.clientContext && typeof input.clientContext === 'object'
          ? {
              ...(this.normalizeOptionalTrimmedString(input.clientContext.app, 128)
                ? { app: this.normalizeOptionalTrimmedString(input.clientContext.app, 128) }
                : {}),
              ...(this.normalizeOptionalTrimmedString(input.clientContext.surface, 128)
                ? { surface: this.normalizeOptionalTrimmedString(input.clientContext.surface, 128) }
                : {})
            }
          : null;
      const dedupeKey = this.buildModerationCaseDedupeKey({
        source: 'local-user-report',
        reporterWebId: webId,
        subject,
        reasonType,
        reason,
        evidenceObjectRefs,
        requestedForwarding
      });
      const existing = this.findStoredModerationCaseByDedupe(dedupeKey);
      if (existing) {
        return {
          case: existing,
          duplicate: true,
          canonicalPublished: existing.canonicalEvent?.status === 'published',
          canonicalIntentId: existing.canonicalEvent?.canonicalIntentId || null
        };
      }

      const now = new Date().toISOString();
      const created = await this.ingestStoredModerationCase({
        id: ulid().toLowerCase(),
        source: 'local-user-report',
        protocol: 'activitypods',
        dedupeKey,
        reporter,
        reasonType,
        reason,
        requestedForwarding,
        clientContext,
        subject,
        evidenceObjectRefs,
        createdAt: now,
        receivedAt: now,
        status: 'open',
        relatedDecisionIds: [],
        canonicalEvent: {
          status: 'pending'
        }
      });

      const publishResult = await this.publishCanonicalModerationReport(created.case);
      const canonicalPatch = publishResult.ok
        ? {
            canonicalEvent: {
              status: 'published',
              canonicalIntentId: publishResult.canonicalIntentId || undefined,
              lastAttemptAt: now,
              publishedAt: now,
              lastError: undefined
            }
          }
        : {
            canonicalEvent: {
              status: 'failed',
              lastAttemptAt: now,
              lastError: publishResult.error
            }
          };
      const updatedCase = (await this.patchStoredModerationCase(created.case.id, canonicalPatch)) || created.case;

      return {
        case: updatedCase,
        duplicate: false,
        canonicalPublished: publishResult.ok,
        canonicalIntentId: publishResult.canonicalIntentId || null
      };
    },

    parseProviderActors(raw) {
      const values = String(raw || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean)
        .map(value => value.toLowerCase());

      return new Set(values);
    },

    actorKeyCandidates(webId) {
      const keys = new Set();
      const normalized = String(webId || '').trim();
      if (!normalized) return keys;

      keys.add(normalized.toLowerCase());

      try {
        const url = new URL(normalized);
        const hostPath = `${url.host}${url.pathname}`.replace(/\/+$/, '').toLowerCase();
        if (hostPath) keys.add(hostPath);

        const segments = url.pathname.split('/').filter(Boolean);
        const username = segments[0]?.toLowerCase();
        if (username) keys.add(username);
      } catch {
        // If webId is malformed, keep only the normalized raw form.
      }

      return keys;
    },

    isProviderActor(webId) {
      if (this.providerActors.has('*')) return true;
      if (this.providerActors.size === 0) return false;

      const candidates = this.actorKeyCandidates(webId);
      for (const candidate of candidates) {
        if (this.providerActors.has(candidate)) return true;
      }

      return false;
    },

    sanitizePathSegment(value, name) {
      if (!value || typeof value !== 'string') {
        throw new MoleculerError(`${name} is required`, 400, 'VALIDATION_ERROR');
      }

      const trimmed = value.trim();
      if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
        throw new MoleculerError(`${name} contains invalid characters`, 400, 'VALIDATION_ERROR');
      }

      return trimmed;
    },

    requirePlainObject(value, name) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new MoleculerError(`${name} must be an object`, 400, 'VALIDATION_ERROR');
      }
      return value;
    },

    pickAllowedTraceQuery(query) {
      const out = {};
      for (const [key, value] of Object.entries(query)) {
        if (!MRF_TRACE_QUERY_KEYS.has(key)) continue;
        if (value === undefined || value === null || value === '') continue;
        out[key] = String(value).slice(0, 512);
      }
      return out;
    },

    pickAllowedMetricsQuery(query) {
      const out = {};
      for (const [key, value] of Object.entries(query)) {
        if (!MRF_METRICS_QUERY_KEYS.has(key)) continue;
        if (value === undefined || value === null || value === '') continue;
        out[key] = String(value).slice(0, 512);
      }
      return out;
    },

    pickModerationQuery(query = {}) {
      const out = {};
      for (const [key, value] of Object.entries(query)) {
        if (!MODERATION_QUERY_KEYS.has(key)) continue;
        if (value === undefined || value === null || value === '') continue;
        out[key] = String(value).slice(0, 512);
      }
      return out;
    },

    buildModerationDecisionCachePage(query = {}) {
      const limit = Math.min(Number(query.limit) || 100, 500);
      const cursor = typeof query.cursor === 'string' ? query.cursor.trim() : '';
      const includeRevoked = query.includeRevoked !== 'false';
      const action = typeof query.action === 'string' ? query.action : '';
      const targetAtDid = typeof query.targetAtDid === 'string' ? query.targetAtDid : '';
      const targetActorUri = typeof query.targetActorUri === 'string' ? query.targetActorUri : '';
      const targetWebId = typeof query.targetWebId === 'string' ? query.targetWebId : '';

      const ordered = [...this._moderationDecisions].reverse().filter(entry => {
        if (!includeRevoked && entry?.revoked) return false;
        if (action && entry?.action !== action) return false;
        if (targetAtDid && entry?.targetAtDid !== targetAtDid) return false;
        if (targetActorUri && entry?.targetActorUri !== targetActorUri) return false;
        if (targetWebId && entry?.targetWebId !== targetWebId) return false;
        return true;
      });

      let start = 0;
      if (cursor) {
        const cursorIndex = ordered.findIndex(entry => entry?.id === cursor);
        start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
      }

      const data = ordered.slice(start, start + limit);
      const nextCursor = start + limit < ordered.length ? data[data.length - 1]?.id || null : null;
      return {
        data,
        cursor: nextCursor,
        total: ordered.length,
        source: 'local'
      };
    },

    mergeModerationCaseCache(entries = []) {
      const ordered = Array.isArray(this._moderationCases) ? [...this._moderationCases] : [];
      const byId = new Map(ordered.map(entry => [entry?.id, entry]));
      let changed = false;

      for (const entry of entries) {
        if (!entry?.id) continue;
        const existing = byId.get(entry.id);
        const nextSerialized = JSON.stringify(entry);
        if (!existing || JSON.stringify(existing) !== nextSerialized) {
          byId.set(entry.id, entry);
          changed = true;
        }
      }

      const merged = [...byId.values()]
        .filter(Boolean)
        .sort((left, right) => {
          const leftTs = Date.parse(left?.receivedAt || left?.updatedAt || 0) || 0;
          const rightTs = Date.parse(right?.receivedAt || right?.updatedAt || 0) || 0;
          return rightTs - leftTs;
        })
        .slice(0, this.settings.auditLogMaxEntries);

      return {
        changed,
        entries: merged
      };
    },

    buildModerationCaseCachePage(query = {}) {
      const limit = Math.min(Number(query.limit) || 100, 500);
      const cursor = typeof query.cursor === 'string' ? query.cursor.trim() : '';
      const source = typeof query.source === 'string' ? query.source : '';
      const status = typeof query.status === 'string' ? query.status : '';
      const sourceActorUri = typeof query.sourceActorUri === 'string' ? query.sourceActorUri : '';
      const recipientWebId = typeof query.recipientWebId === 'string' ? query.recipientWebId : '';
      const reportedActorUri = typeof query.reportedActorUri === 'string' ? query.reportedActorUri : '';

      const ordered = this.sortStoredModerationCases(this._moderationCases).filter(entry => {
        if (source && entry?.source !== source) return false;
        if (status && entry?.status !== status) return false;
        if (sourceActorUri && entry?.reporter?.activityPubActorUri !== sourceActorUri) return false;
        if (recipientWebId && entry?.recipient?.webId !== recipientWebId) return false;
        if (reportedActorUri && !this.caseMatchesReportedActorUri(entry, reportedActorUri)) return false;
        return true;
      });

      let start = 0;
      if (cursor) {
        const cursorIndex = ordered.findIndex(entry => entry?.id === cursor);
        start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
      }

      const data = ordered.slice(start, start + limit);
      const nextCursor = start + limit < ordered.length ? data[data.length - 1]?.id || null : null;
      return {
        data,
        cursor: nextCursor,
        total: ordered.length,
        source: 'local'
      };
    },

    caseBelongsToReporter(entry, webId) {
      return Boolean(entry?.reporter?.webId && String(entry.reporter.webId).trim() === String(webId).trim());
    },

    buildOwnerModerationCasePage(webId, query = {}) {
      const limit = Math.min(Number(query.limit) || 100, 500);
      const cursor = typeof query.cursor === 'string' ? query.cursor.trim() : '';
      const status = typeof query.status === 'string' ? query.status : '';
      const source = typeof query.source === 'string' ? query.source : '';

      const ordered = this.sortStoredModerationCases(this._moderationCases).filter(entry => {
        if (!this.caseBelongsToReporter(entry, webId)) return false;
        if (status && entry?.status !== status) return false;
        if (source && entry?.source !== source) return false;
        return true;
      });

      let start = 0;
      if (cursor) {
        const cursorIndex = ordered.findIndex(entry => entry?.id === cursor);
        start = cursorIndex >= 0 ? cursorIndex + 1 : 0;
      }

      const data = ordered.slice(start, start + limit);
      const nextCursor = start + limit < ordered.length ? data[data.length - 1]?.id || null : null;
      return {
        data,
        cursor: nextCursor,
        total: ordered.length,
        source: 'local'
      };
    },

    caseMatchesReportedActorUri(entry, actorUri) {
      if (!entry || !actorUri) return false;
      if (entry.subject?.kind === 'account' && entry.subject?.actor?.activityPubActorUri === actorUri) {
        return true;
      }
      if (entry.subject?.kind === 'object' && entry.subject?.owner?.activityPubActorUri === actorUri) {
        return true;
      }
      return false;
    },

    async buildOwnerModerationDecisionPage(ctx, webId, query = {}) {
      const binding = await this.getOptionalIdentityBindingForWebId(ctx, webId);
      const targetWebId = String(webId).trim();
      const targetActorUri = this.normalizeOptionalHttpUrl(binding?.activityPubActorUri);
      const targetAtDid = this.normalizeOptionalTrimmedString(binding?.atprotoDid, 512);
      const mergedQuery = {
        ...query,
        ...(query.targetWebId ? {} : targetWebId ? { targetWebId } : {}),
        ...(query.targetActorUri ? {} : targetActorUri ? { targetActorUri } : {}),
        ...(query.targetAtDid ? {} : targetAtDid ? { targetAtDid } : {})
      };

      return this.buildModerationDecisionCachePage(mergedQuery);
    },

    async emitPrivateModerationNotification(ctx, principal, payload) {
      const normalizedPrincipal = this.normalizeOptionalHttpUrl(principal);
      if (!normalizedPrincipal) return false;

      try {
        await ctx.call('realtime-private-emitter.publish', {
          topic: 'notifications',
          event: 'notification',
          principal: normalizedPrincipal,
          id: `moderation:${ulid().toLowerCase()}`,
          payload: {
            scope: 'moderation',
            emittedAt: new Date().toISOString(),
            link: '/settings/moderation/reports',
            ...payload
          }
        });
        return true;
      } catch (error) {
        this.logger.warn('[ModerationNotifications] Failed to emit private moderation notification', {
          principal: normalizedPrincipal,
          kind: payload?.kind,
          error: error?.message
        });
        return false;
      }
    },

    async emitModerationReportCreatedNotification(ctx, caseRecord) {
      const reporterWebId = this.normalizeOptionalHttpUrl(caseRecord?.reporter?.webId);
      if (!reporterWebId) return false;

      return this.emitPrivateModerationNotification(ctx, reporterWebId, {
        kind: 'moderation.report.created',
        title: 'Report submitted',
        body: caseRecord?.requestedForwarding?.remote
          ? 'Your report was saved and remote forwarding was requested where supported.'
          : 'Your report was saved for provider review.',
        caseId: caseRecord.id,
        status: caseRecord.status,
        reasonType: caseRecord.reasonType,
        authoritativeProtocol: caseRecord?.subject?.authoritativeProtocol || 'local'
      });
    },

    async emitModerationCaseUpdateNotifications(ctx, previousCase, nextCase) {
      const reporterWebId = this.normalizeOptionalHttpUrl(nextCase?.reporter?.webId);
      if (!reporterWebId || !nextCase) return false;

      const messages = [];
      if (previousCase?.status !== nextCase?.status) {
        if (nextCase.status === 'resolved') {
          messages.push('A moderator resolved your report.');
        } else if (nextCase.status === 'dismissed') {
          messages.push('A moderator dismissed your report.');
        } else if (nextCase.status === 'open' && previousCase?.status && previousCase.status !== 'open') {
          messages.push('Your report was reopened for further review.');
        }
      }

      const previousApStatus = previousCase?.forwarding?.activityPub?.status || null;
      const nextApStatus = nextCase?.forwarding?.activityPub?.status || null;
      if (previousApStatus !== nextApStatus) {
        if (nextApStatus === 'pending') {
          messages.push('Your report is being prepared for remote ActivityPub forwarding.');
        } else if (nextApStatus === 'queued') {
          messages.push('Your report was queued for remote ActivityPub forwarding.');
        } else if (nextApStatus === 'delivered') {
          messages.push('Your report was delivered to the remote ActivityPub server.');
        } else if (nextApStatus === 'failed') {
          messages.push('Remote ActivityPub forwarding failed.');
        } else if (nextApStatus === 'skipped') {
          messages.push('Remote ActivityPub forwarding was skipped.');
        }
      }

      const previousAtStatus = previousCase?.forwarding?.atproto?.status || null;
      const nextAtStatus = nextCase?.forwarding?.atproto?.status || null;
      if (previousAtStatus !== nextAtStatus) {
        if (nextAtStatus === 'pending') {
          messages.push('Your report is being sent to the remote AT Protocol moderation service.');
        } else if (nextAtStatus === 'delivered') {
          messages.push('Your report was delivered to the remote AT Protocol moderation service.');
        } else if (nextAtStatus === 'failed') {
          messages.push('Remote AT Protocol forwarding failed.');
        } else if (nextAtStatus === 'skipped') {
          messages.push('Remote AT Protocol forwarding was skipped.');
        }
      }

      if (messages.length === 0) return false;

      return this.emitPrivateModerationNotification(ctx, reporterWebId, {
        kind: 'moderation.report.updated',
        title: 'Report update',
        body: messages.join(' '),
        caseId: nextCase.id,
        status: nextCase.status,
        reasonType: nextCase.reasonType,
        forwarding: {
          activityPub: nextApStatus,
          atproto: nextAtStatus
        }
      });
    },

    async resolveDecisionNotificationPrincipal(ctx, decision) {
      const explicitWebId = this.normalizeOptionalHttpUrl(decision?.targetWebId);
      if (explicitWebId) return explicitWebId;

      const targetAtDid = this.normalizeOptionalTrimmedString(decision?.targetAtDid, 512);
      if (targetAtDid) {
        try {
          const projection = await ctx.call('internal-identity-projection.getByDid', {
            atprotoDid: targetAtDid
          });
          return this.normalizeOptionalHttpUrl(projection?.webId);
        } catch (error) {
          this.logger.debug?.('[ModerationNotifications] Failed to resolve local DID target', {
            targetAtDid,
            error: error?.message
          });
        }
      }

      const targetHandle = this.normalizeOptionalTrimmedString(decision?.targetHandle, 512);
      if (targetHandle) {
        try {
          const projection = await ctx.call('internal-identity-projection.getByHandle', {
            atprotoHandle: targetHandle.toLowerCase()
          });
          return this.normalizeOptionalHttpUrl(projection?.webId);
        } catch (error) {
          this.logger.debug?.('[ModerationNotifications] Failed to resolve local handle target', {
            targetHandle,
            error: error?.message
          });
        }
      }

      return null;
    },

    async emitModerationDecisionNotification(ctx, decision, lifecycle) {
      const principal = await this.resolveDecisionNotificationPrincipal(ctx, decision);
      if (!principal) return false;

      const action = this.normalizeOptionalTrimmedString(decision?.action, 64) || 'moderation';
      const protocols = this.normalizeOptionalTrimmedString(decision?.protocols, 32) || 'none';
      const reason = this.normalizeOptionalTrimmedString(decision?.reason, 500);

      return this.emitPrivateModerationNotification(ctx, principal, {
        kind: lifecycle === 'revoked' ? 'moderation.decision.revoked' : 'moderation.decision.applied',
        title: lifecycle === 'revoked' ? 'Moderation action revoked' : 'Moderation action applied',
        body:
          lifecycle === 'revoked'
            ? `A previous ${action} moderation action affecting your pod identity was revoked.`
            : `A ${action} moderation action affecting your pod identity was applied.`,
        decisionId: decision?.id || null,
        action,
        protocols,
        ...(reason ? { reason } : {}),
        ...(decision?.sourceCaseId ? { sourceCaseId: decision.sourceCaseId } : {})
      });
    },

    async mrfProxy(ctx, { method, path, permission, body }) {
      const webId = this.requireWebId(ctx);

      if (!this.isProviderActor(webId)) {
        throw new MoleculerError('Provider access is required', 403, 'PROVIDER_ACCESS_REQUIRED');
      }

      if (!this.settings.mrfAdminToken) {
        throw new MoleculerError('MRF control plane is not configured', 503, 'MRF_NOT_CONFIGURED');
      }

      const requestId = ctx.meta.requestID || ctx.meta.requestId || ctx.meta.$requestID || ctx.id || ulid();

      const execute = async () => {
        const url = `${this.settings.mrfAdminBaseUrl}${path}`;
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${this.settings.mrfAdminToken}`,
            'Content-Type': 'application/json',
            'X-Request-Id': String(requestId),
            'X-Provider-Actor': webId,
            'X-Provider-Permissions': permission
          },
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.settings.mrfTimeoutMs)
        });

        const text = await response.text();
        const payload = text ? this.tryParseJson(text) : {};

        if (!response.ok) {
          const code = payload?.error?.code || 'MRF_PROXY_ERROR';
          const message = payload?.error?.message || `MRF request failed (${response.status})`;

          if (response.status === 401 || response.status === 403) {
            throw new MoleculerError('MRF backend authorization failed', 502, 'MRF_BACKEND_AUTH', {
              requestId,
              upstreamCode: code
            });
          }

          const error = new MoleculerError(message, response.status, code, {
            requestId,
            upstreamCode: code,
            details: payload?.error?.details
          });

          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }

        return payload;
      };

      try {
        return await this.mrfCircuit.execute(() =>
          retryWithBackoff(execute, {
            maxRetries: Math.max(0, this.settings.mrfRetries - 1),
            baseDelayMs: Math.max(25, this.settings.mrfRetryBaseDelayMs),
            maxDelayMs: Math.max(this.settings.mrfRetryBaseDelayMs, this.settings.mrfRetryMaxDelayMs),
            retryIf: err => err?.retryable !== false
          })
        );
      } catch (err) {
        if (err instanceof CircuitOpenError) {
          throw new MoleculerError('MRF control plane is temporarily unavailable', 503, 'MRF_CIRCUIT_OPEN');
        }
        throw err;
      }
    },

    tryParseJson(text) {
      try {
        return JSON.parse(text);
      } catch {
        return {};
      }
    },

    normalizeDomainLike(value, fieldName = 'domain') {
      const candidate = String(value || '')
        .trim()
        .toLowerCase();
      if (!candidate) {
        throw new MoleculerError(`${fieldName} is required`, 400, 'VALIDATION_ERROR');
      }

      const withoutWildcard = candidate.startsWith('*.') ? candidate.slice(2) : candidate;
      const urlLike = /^[a-z][a-z0-9+.-]*:\/\//i.test(withoutWildcard) ? withoutWildcard : `https://${withoutWildcard}`;

      try {
        const parsed = new URL(urlLike);
        if (!parsed.hostname) {
          throw new Error('missing_host');
        }
        return parsed.hostname.toLowerCase();
      } catch {
        throw new MoleculerError(`Invalid ${fieldName}`, 400, 'VALIDATION_ERROR');
      }
    },

    normalizeFediseerSourceDomains(values) {
      const unique = new Set();
      for (const value of Array.isArray(values) ? values : []) {
        if (value === undefined || value === null || value === '') continue;
        unique.add(this.normalizeDomainLike(value, 'sourceDomain'));
      }
      return [...unique];
    },

    splitFediseerList(value) {
      if (Array.isArray(value)) {
        return [...new Set(value.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean))];
      }

      if (typeof value === 'string' && value.trim().length > 0) {
        return [
          ...new Set(
            value
              .split(',')
              .map(item => item.trim())
              .filter(Boolean)
          )
        ];
      }

      return [];
    },

    extractFediseerItems(payload) {
      if (Array.isArray(payload)) return payload;
      if (!payload || typeof payload !== 'object') return [];

      for (const key of ['instances', 'data', 'items', 'results', 'domains']) {
        if (Array.isArray(payload[key])) {
          return payload[key];
        }
      }

      return [];
    },

    normalizeFediseerSignalEntries(items, signal, fallbackSourceDomains) {
      const out = [];

      for (const item of items) {
        if (typeof item === 'string') {
          try {
            out.push({
              targetDomain: this.normalizeDomainLike(item, 'targetDomain'),
              signal,
              sourceDomains: [...fallbackSourceDomains],
              reasons: [],
              evidence: [],
              count: 1
            });
          } catch {
            // Ignore malformed domains in remote payloads.
          }
          continue;
        }

        if (!item || typeof item !== 'object') continue;

        const targetCandidate =
          item.domain ||
          item.hostname ||
          item.host ||
          item.instance ||
          item.name ||
          item.domain_name ||
          item.instance_domain ||
          item?.instance?.domain ||
          item?.instance?.name ||
          item?.instance?.host;

        let targetDomain;
        try {
          targetDomain = this.normalizeDomainLike(targetCandidate, 'targetDomain');
        } catch {
          continue;
        }

        const sourceDomainCandidates = [
          ...(Array.isArray(item.sourceDomains) ? item.sourceDomains : []),
          ...(Array.isArray(item.source_domains) ? item.source_domains : []),
          ...this.splitFediseerList(item.sources),
          ...this.splitFediseerList(item.domains),
          ...this.splitFediseerList(item.censured_by),
          ...this.splitFediseerList(item.hesitated_by),
          ...this.splitFediseerList(item.endorsed_by),
          ...this.splitFediseerList(item.source),
          ...this.splitFediseerList(item.source_domain),
          ...this.splitFediseerList(item.given_by)
        ];

        let sourceDomains = [...fallbackSourceDomains];
        if (sourceDomainCandidates.length > 0) {
          try {
            sourceDomains = this.normalizeFediseerSourceDomains(sourceDomainCandidates);
          } catch {
            sourceDomains = [...fallbackSourceDomains];
          }
        }

        const reasons = this.splitFediseerList(
          item[`${signal}_reasons`] || item.reasons || item.reason || item.comment || item.comments
        ).slice(0, 20);
        const evidence = this.splitFediseerList(
          item[`${signal}_evidence`] || item.evidence || item.details || item.notes
        ).slice(0, 10);
        const countValue = Number(
          item[`${signal}_count`] ?? item.count ?? item.instance_count ?? item.votes ?? (sourceDomains.length || 1)
        );

        out.push({
          targetDomain,
          signal,
          sourceDomains,
          reasons,
          evidence,
          count: Number.isFinite(countValue) ? Math.max(1, Math.trunc(countValue)) : 1
        });
      }

      return out;
    },

    buildFediseerServiceUrl(pathname) {
      const base = String(this.settings.fediseerBaseUrl || FEDISEER_DEFAULT_BASE_URL).trim();
      if (!base) {
        throw new MoleculerError('Fediseer is not configured', 503, 'FEDISEER_NOT_CONFIGURED');
      }

      const normalizedBase = base.endsWith('/') ? base : `${base}/`;
      return new URL(pathname.replace(/^\//, ''), normalizedBase);
    },

    async fetchFediseerSignalEntries(endpoint, sourceDomains, signal, maxPages = 3) {
      const normalizedSources = this.normalizeFediseerSourceDomains(sourceDomains);
      if (normalizedSources.length === 0) return [];

      const entries = [];
      const seenPageFingerprints = new Set();

      for (let page = 1; page <= maxPages; page += 1) {
        const endpointUrl = this.buildFediseerServiceUrl(
          `api/v1/${endpoint}/${encodeURIComponent(normalizedSources.join(','))}`
        );
        endpointUrl.searchParams.set('page', String(page));
        endpointUrl.searchParams.set('per_page', String(FEDISEER_PAGE_SIZE));

        const execute = async () => {
          const response = await fetch(endpointUrl.toString(), {
            method: 'GET',
            headers: {
              accept: 'application/json',
              ...(this.settings.fediseerApiKey ? { apikey: this.settings.fediseerApiKey } : {})
            },
            signal: AbortSignal.timeout(Math.max(1000, this.settings.mrfTimeoutMs))
          });

          const text = await response.text();
          const payload = text ? this.tryParseJson(text) : {};
          if (!response.ok) {
            const error = new MoleculerError(
              payload?.message || `Fediseer request failed (${response.status})`,
              response.status,
              'FEDISEER_FETCH_FAILED'
            );
            error.retryable = response.status === 429 || response.status >= 500;
            throw error;
          }

          return payload;
        };

        const payload = await retryWithBackoff(execute, {
          maxRetries: Math.max(0, this.settings.mrfRetries - 1),
          baseDelayMs: Math.max(25, this.settings.mrfRetryBaseDelayMs),
          maxDelayMs: Math.max(this.settings.mrfRetryBaseDelayMs, this.settings.mrfRetryMaxDelayMs),
          retryIf: err => err?.retryable !== false
        });

        const pageEntries = this.normalizeFediseerSignalEntries(
          this.extractFediseerItems(payload),
          signal,
          normalizedSources
        );
        if (pageEntries.length === 0) break;

        const fingerprint = JSON.stringify(
          pageEntries
            .map(entry => `${entry.targetDomain}|${entry.signal}|${entry.sourceDomains.join(',')}`)
            .slice(0, 64)
        );
        if (seenPageFingerprints.has(fingerprint)) {
          break;
        }
        seenPageFingerprints.add(fingerprint);

        entries.push(...pageEntries);
        if (pageEntries.length < FEDISEER_PAGE_SIZE) break;
      }

      const deduped = new Map();
      for (const entry of entries) {
        const key = `${entry.signal}:${entry.targetDomain}`;
        const existing = deduped.get(key);
        if (!existing) {
          deduped.set(key, {
            ...entry,
            sourceDomains: [...new Set(entry.sourceDomains)],
            reasons: [...new Set(entry.reasons)],
            evidence: [...new Set(entry.evidence)]
          });
          continue;
        }

        deduped.set(key, {
          ...existing,
          sourceDomains: [...new Set([...(existing.sourceDomains || []), ...(entry.sourceDomains || [])])],
          reasons: [...new Set([...(existing.reasons || []), ...(entry.reasons || [])])],
          evidence: [...new Set([...(existing.evidence || []), ...(entry.evidence || [])])],
          count: Math.max(Number(existing.count || 1), Number(entry.count || 1))
        });
      }

      return [...deduped.values()].sort((left, right) => left.targetDomain.localeCompare(right.targetDomain));
    },

    aggregateFediseerSignalEntries(entries, { censureAction, hesitationAction }) {
      const byDomain = new Map();

      for (const entry of entries) {
        if (!entry?.targetDomain) continue;
        const nextAction = entry.signal === 'censure' ? censureAction : hesitationAction;
        const existing = byDomain.get(entry.targetDomain) || {
          targetDomain: entry.targetDomain,
          ruleId: `${FEDISEER_MANAGED_RULE_PREFIX}${entry.targetDomain}`,
          action: nextAction,
          signals: [],
          sourceDomains: [],
          reasons: [],
          evidence: [],
          censureCount: 0,
          hesitationCount: 0
        };

        const strongerAction = existing.action === 'reject' || nextAction === 'reject' ? 'reject' : 'filter';
        existing.action = strongerAction;
        existing.signals = [...new Set([...(existing.signals || []), entry.signal])];
        existing.sourceDomains = [...new Set([...(existing.sourceDomains || []), ...(entry.sourceDomains || [])])];
        existing.reasons = [...new Set([...(existing.reasons || []), ...(entry.reasons || [])])].slice(0, 20);
        existing.evidence = [...new Set([...(existing.evidence || []), ...(entry.evidence || [])])].slice(0, 10);
        if (entry.signal === 'censure') {
          existing.censureCount += Number(entry.count || 1);
        } else {
          existing.hesitationCount += Number(entry.count || 1);
        }

        byDomain.set(entry.targetDomain, existing);
      }

      return [...byDomain.values()]
        .map(entry => ({
          ...entry,
          reason: this.buildFediseerRuleReason(entry)
        }))
        .sort((left, right) => {
          const actionRank = left.action === right.action ? 0 : left.action === 'reject' ? -1 : 1;
          return actionRank || left.targetDomain.localeCompare(right.targetDomain);
        });
    },

    buildFediseerRuleReason(entry) {
      const sourcePreview = (entry.sourceDomains || []).slice(0, 4).join(', ');
      const sourceSuffix =
        Array.isArray(entry.sourceDomains) && entry.sourceDomains.length > 4
          ? ` and ${entry.sourceDomains.length - 4} more`
          : '';
      const signalSummary = [
        entry.censureCount > 0 ? `${entry.censureCount} censure${entry.censureCount === 1 ? '' : 's'}` : null,
        entry.hesitationCount > 0
          ? `${entry.hesitationCount} hesitation${entry.hesitationCount === 1 ? '' : 's'}`
          : null
      ]
        .filter(Boolean)
        .join(', ');
      const reasonSummary =
        Array.isArray(entry.reasons) && entry.reasons.length > 0
          ? ` Reasons: ${entry.reasons.slice(0, 3).join(', ')}${entry.reasons.length > 3 ? ', ...' : ''}.`
          : '';

      return [
        `Fediseer ${entry.action} import for ${entry.targetDomain}.`,
        signalSummary ? ` Signals: ${signalSummary}.` : '',
        sourcePreview ? ` Sources: ${sourcePreview}${sourceSuffix}.` : '',
        reasonSummary
      ]
        .join('')
        .trim()
        .slice(0, 500);
    },

    async getFediseerSourceDomainsForWebId(ctx, webId) {
      const trustSources = await this.listByContainer(ctx, webId, 'trust-sources', { seedProviderDefaults: false });
      return this.normalizeFediseerSourceDomains(
        trustSources
          .filter(item => item?.enabled !== false && String(item?.sourceType || '').toLowerCase() === 'fediseer')
          .map(item => item?.source)
      );
    },

    async applyFediseerRules(ctx, webId, entries, { replaceExisting }) {
      const moduleResponse = await this.mrfProxy(ctx, {
        method: 'GET',
        path: '/internal/admin/mrf/modules/activitypub-subject-policy',
        permission: 'provider:read'
      });

      const moduleConfig = moduleResponse?.data?.config || {};
      const revision = Number.isInteger(moduleConfig?.revision) ? moduleConfig.revision : 0;
      const currentRules = Array.isArray(moduleConfig?.config?.rules) ? moduleConfig.config.rules : [];
      const manualRules = currentRules.filter(rule => !String(rule?.id || '').startsWith(FEDISEER_MANAGED_RULE_PREFIX));
      const existingFediseerRules = currentRules.filter(rule =>
        String(rule?.id || '').startsWith(FEDISEER_MANAGED_RULE_PREFIX)
      );
      const nextFediseerRules = entries.map(entry => ({
        id: entry.ruleId,
        action: entry.action,
        domain: entry.targetDomain,
        reason: entry.reason,
        createdAt: new Date().toISOString(),
        createdBy: webId
      }));

      const mergedRules = replaceExisting
        ? [...manualRules, ...nextFediseerRules]
        : [
            ...manualRules,
            ...existingFediseerRules.filter(rule => !nextFediseerRules.some(nextRule => nextRule.id === rule.id)),
            ...nextFediseerRules
          ];

      if (mergedRules.length > 1000) {
        throw new MoleculerError(
          `Fediseer sync would exceed the ActivityPub subject-policy limit of 1000 rules (${mergedRules.length})`,
          400,
          'FEDISEER_RULE_LIMIT_EXCEEDED',
          { totalRules: mergedRules.length }
        );
      }

      const nextMode = moduleConfig?.mode === 'disabled' ? 'enforce' : moduleConfig?.mode || 'enforce';
      const patchResponse = await this.mrfProxy(ctx, {
        method: 'PATCH',
        path: '/internal/admin/mrf/modules/activitypub-subject-policy',
        permission: 'provider:write',
        body: {
          enabled: true,
          mode: nextMode,
          config: {
            rules: mergedRules
          },
          expectedRevision: revision
        }
      });

      return {
        previousManagedRules: existingFediseerRules.length,
        activeManagedRules: nextFediseerRules.length,
        totalRules: mergedRules.length,
        removedRules: replaceExisting ? Math.max(0, existingFediseerRules.length - nextFediseerRules.length) : 0,
        revision: patchResponse?.data?.revision || null,
        mode: patchResponse?.data?.mode || nextMode
      };
    },

    requireWebId(ctx) {
      const webId = ctx.meta.webId;
      if (!webId || webId === 'anon') throw new MoleculerError('Unauthorized', 401);
      return webId;
    },

    normalizeClientIdentifier(value) {
      if (typeof value !== 'string') return null;
      const trimmed = value.trim();
      if (!trimmed) return null;

      try {
        const parsed = new URL(trimmed);
        parsed.hash = '';
        parsed.search = '';

        // Keep the path stable while avoiding cosmetic mismatches from trailing slashes.
        if (parsed.pathname.length > 1) {
          parsed.pathname = parsed.pathname.replace(/\/+$/, '');
        }

        return parsed.toString();
      } catch {
        return trimmed;
      }
    },

    parseConsentPermissions(value) {
      const list = Array.isArray(value) ? value : value ? [value] : [];
      return [
        ...new Set(
          list
            .map(item => (typeof item === 'string' ? item.trim() : ''))
            .filter(Boolean)
        )
      ];
    },

    parseTokenPermissions(tokenPayload) {
      if (!tokenPayload || typeof tokenPayload !== 'object') return [];

      const fromScopeString = typeof tokenPayload.scope === 'string' ? tokenPayload.scope.split(/\s+/) : [];
      const fromScopeArray = Array.isArray(tokenPayload.scope) ? tokenPayload.scope : [];
      const fromScpArray = Array.isArray(tokenPayload.scp) ? tokenPayload.scp : [];

      return this.parseConsentPermissions([...fromScopeString, ...fromScopeArray, ...fromScpArray]);
    },

    hasConsentPermission(permissions, requiredPermission) {
      if (!requiredPermission) return true;

      const scopes = new Set(this.parseConsentPermissions(permissions));
      if (scopes.has(requiredPermission)) return true;

      // write:moderation is a strict superset of read:moderation.
      if (requiredPermission === 'read:moderation' && scopes.has('write:moderation')) {
        return true;
      }

      if (requiredPermission === 'read:trust' && scopes.has('write:trust')) {
        return true;
      }

      return false;
    },

    hasAnyConsentPermission(permissions, requiredPermissions) {
      const required = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
      return required.some(permission => this.hasConsentPermission(permissions, permission));
    },

    async findAppConsentForClient(ctx, ownerWebId, clientId) {
      const client = this.normalizeClientIdentifier(clientId);
      if (!client) return null;

      const consents = await this.listByContainer(ctx, ownerWebId, 'app-consents', {
        seedProviderDefaults: false,
        skipAtprotoMirror: true
      });

      return (
        consents.find(item => {
          const consentClient = this.normalizeClientIdentifier(item?.clientId);
          return consentClient && consentClient === client;
        }) || null
      );
    },

    async requireDelegatedModerationAccess(ctx, requiredPermission) {
      const actingWebId = this.requireWebId(ctx);
      const impersonatedUser = typeof ctx.meta?.impersonatedUser === 'string' ? ctx.meta.impersonatedUser.trim() : '';
      const requiredPermissions = Array.isArray(requiredPermission) ? requiredPermission : [requiredPermission];

      // Non-delegated first-party callers (e.g., dashboard session) are allowed.
      if (!impersonatedUser || impersonatedUser === actingWebId) {
        return {
          ownerWebId: actingWebId,
          clientId: null,
          consent: null
        };
      }

      const tokenPermissions = this.parseTokenPermissions(ctx.meta?.tokenPayload);
      if (this.hasAnyConsentPermission(tokenPermissions, requiredPermissions)) {
        return {
          ownerWebId: impersonatedUser,
          clientId: actingWebId,
          consent: null
        };
      }

      const consent = await this.findAppConsentForClient(ctx, impersonatedUser, actingWebId);
      if (!consent || !this.hasAnyConsentPermission(consent.permissions, requiredPermissions)) {
        throw new MoleculerError('Forbidden', 403, 'APP_CONSENT_REQUIRED');
      }

      return {
        ownerWebId: impersonatedUser,
        clientId: actingWebId,
        consent
      };
    },

    async resolveCanonicalAccountId(ctx, webId) {
      try {
        const binding = await ctx.call('identitybindings.getByCanonicalAccountId', {
          canonicalAccountId: webId
        });

        if (binding && typeof binding.canonicalAccountId === 'string' && binding.canonicalAccountId.trim().length > 0) {
          return binding.canonicalAccountId.trim();
        }
      } catch {
        // Fall back to webId when identity binding lookup is unavailable.
      }

      return webId;
    },

    async getOptionalIdentityBindingForWebId(ctx, webId) {
      try {
        const binding = await ctx.call('identitybindings.getByCanonicalAccountId', {
          canonicalAccountId: webId
        });
        return binding && typeof binding === 'object' ? binding : null;
      } catch {
        return null;
      }
    },

    requireContainer(c) {
      if (!ALLOWED.has(c)) throw new MoleculerError('Invalid container', 400);
      return c;
    },

    base(webId) {
      const u = new URL(webId);
      u.hash = '';
      let b = u.toString();
      if (!b.endsWith('/')) b += '/';
      return b;
    },

    dataContainer(webId) {
      return `${this.base(webId)}data/`;
    },

    resourceTypeForContainer(container) {
      return RESOURCE_TYPE_BY_CONTAINER[container];
    },

    containerForResource(resource) {
      const resourceType = this.normalizeType(resource.type || resource['@type']);

      return Object.keys(RESOURCE_TYPE_BY_CONTAINER).find(container => {
        return (
          RESOURCE_TYPE_BY_CONTAINER[container] === resourceType ||
          RESOURCE_CLASS_URI_BY_CONTAINER[container] === resourceType
        );
      });
    },

    assertImmutableFields(existing, patch, container) {
      const immutableFields = [...IMMUTABLE_FIELDS, ...(IMMUTABLE_FIELDS_BY_CONTAINER[container] || [])];

      for (const field of immutableFields) {
        if (Object.prototype.hasOwnProperty.call(patch, field)) {
          const before = JSON.stringify(existing[field]);
          const after = JSON.stringify(patch[field]);

          if (before !== after) {
            throw new MoleculerError(`${field} is immutable`, 400, 'VALIDATION_ERROR');
          }
        }
      }
    },

    normalizeType(value) {
      if (!value) return null;
      if (Array.isArray(value)) return this.normalizeType(value[0]);
      return String(value);
    },

    normalizeStringOrDefault(value, fallback) {
      if (typeof value !== 'string') return fallback;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : fallback;
    },

    normalizeHttpUrlOrDefault(value, fallback) {
      const candidate =
        typeof value === 'string' && value.trim().length > 0 ? value.trim() : String(fallback || '').trim();
      try {
        const parsed = new URL(candidate);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('invalid_protocol');
        }
        parsed.search = '';
        parsed.hash = '';
        return parsed.origin;
      } catch {
        throw new MoleculerError('Invalid ATProto PDS URL', 400, 'ATPROTO_PDS_URL_INVALID');
      }
    },

    normalizeHttpUrl(value, fieldName = 'url') {
      const candidate = typeof value === 'string' ? value.trim() : '';
      if (!candidate) {
        throw new MoleculerError(`${fieldName} is required`, 400, 'VALIDATION_ERROR');
      }

      try {
        const parsed = new URL(candidate);
        if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.username || parsed.password) {
          throw new Error('invalid_url');
        }
        return parsed.toString();
      } catch {
        throw new MoleculerError(`${fieldName} must be a valid http(s) URL`, 400, 'VALIDATION_ERROR');
      }
    },

    async resolveAtprotoHandleValue(handleInput, pdsUrlInput) {
      const handle = this.normalizeAtprotoHandle(handleInput || '');
      const pdsUrl = this.normalizeHttpUrlOrDefault(pdsUrlInput, 'https://bsky.social');
      const endpoint = new URL('/xrpc/com.atproto.identity.resolveHandle', pdsUrl);
      endpoint.searchParams.set('handle', handle);

      const execute = async () => {
        const response = await fetch(endpoint.toString(), {
          method: 'GET',
          headers: {
            accept: 'application/json'
          },
          signal: AbortSignal.timeout(8000)
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new MoleculerError(
            payload?.message || `Failed to resolve ATProto handle (${response.status})`,
            response.status,
            'ATPROTO_HANDLE_RESOLVE_FAILED'
          );
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }

        const did = typeof payload?.did === 'string' ? payload.did.trim() : '';
        if (!did) {
          const error = new MoleculerError('Resolved DID is missing', 502, 'ATPROTO_HANDLE_RESOLVE_FAILED');
          error.retryable = false;
          throw error;
        }

        return { handle, did };
      };

      return retryWithBackoff(execute, {
        maxRetries: 1,
        baseDelayMs: 100,
        maxDelayMs: 1200,
        retryIf: err => err?.retryable !== false
      });
    },

    buildPdqHashServiceUrl(imageUrl) {
      if (!this.settings.pdqHashServiceBaseUrl) {
        throw new MoleculerError('PDQ hash service is not configured', 503, 'PDQ_HASH_NOT_CONFIGURED');
      }

      const base = this.settings.pdqHashServiceBaseUrl.endsWith('/')
        ? this.settings.pdqHashServiceBaseUrl
        : `${this.settings.pdqHashServiceBaseUrl}/`;
      const endpoint = new URL('pdq-hash', base);
      endpoint.searchParams.set('image_url', imageUrl);
      return endpoint.toString();
    },

    async fetchPdqHashFromService(imageUrl) {
      const endpoint = this.buildPdqHashServiceUrl(imageUrl);
      const execute = async () => {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            accept: 'application/json',
            ...(this.settings.pdqHashServiceBearerToken
              ? { Authorization: `Bearer ${this.settings.pdqHashServiceBearerToken}` }
              : {})
          },
          signal: AbortSignal.timeout(Math.max(1000, this.settings.mrfTimeoutMs))
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          const error = new MoleculerError(
            payload?.message || `PDQ hash lookup failed (${response.status})`,
            response.status,
            'PDQ_HASH_LOOKUP_FAILED'
          );
          error.retryable = response.status === 429 || response.status >= 500;
          throw error;
        }

        const pdqHashBinary =
          typeof payload?.pdq_hash_binary === 'string'
            ? payload.pdq_hash_binary.trim()
            : typeof payload?.pdqHashBinary === 'string'
              ? payload.pdqHashBinary.trim()
              : '';
        const quality =
          typeof payload?.quality === 'number' ? Math.max(0, Math.min(100, Math.trunc(payload.quality))) : null;

        if (!/^[01]{256}$/.test(pdqHashBinary) || quality === null) {
          const error = new MoleculerError(
            'PDQ hash service returned an invalid response',
            502,
            'PDQ_HASH_INVALID_RESPONSE'
          );
          error.retryable = false;
          throw error;
        }

        return { pdqHashBinary, quality };
      };

      return retryWithBackoff(execute, {
        maxRetries: Math.max(0, this.settings.mrfRetries - 1),
        baseDelayMs: Math.max(25, this.settings.mrfRetryBaseDelayMs),
        maxDelayMs: Math.max(this.settings.mrfRetryBaseDelayMs, this.settings.mrfRetryMaxDelayMs),
        retryIf: err => err?.retryable !== false
      });
    },

    normalizeAtprotoHandle(value) {
      const handle = String(value || '')
        .trim()
        .toLowerCase();
      if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(handle)) {
        throw new MoleculerError('Invalid ATProto handle', 400, 'ATPROTO_HANDLE_INVALID');
      }
      return handle;
    },

    normalizeFollowedHashtagInput(value) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new MoleculerError('hashtag is required', 400, 'VALIDATION_ERROR');
      }

      if (value.length > HASHTAG_INPUT_MAX_CHARS) {
        throw new MoleculerError('Invalid hashtag format', 400, 'VALIDATION_ERROR');
      }

      const normalized = normalizeHashtag(value, { allowMissingHash: true });
      if (!normalized) {
        throw new MoleculerError('Invalid hashtag format', 400, 'VALIDATION_ERROR');
      }

      return normalized;
    },

    normalizeHashtagFollowOptions(input = {}) {
      return {
        notify: input.notify === undefined ? true : Boolean(input.notify),
        includeCrossProtocol: input.includeCrossProtocol === undefined ? true : Boolean(input.includeCrossProtocol),
        includeRelated: input.includeRelated === undefined ? true : Boolean(input.includeRelated)
      };
    },

    parseHashtagFollowImportInput(input) {
      if (Array.isArray(input)) {
        if (input.length > HASHTAG_FOLLOWS_IMPORT_MAX_ITEMS) {
          throw new MoleculerError('Too many imported hashtags', 400, 'VALIDATION_ERROR');
        }
        return input.map(item => String(item || '').trim()).filter(Boolean);
      }

      if (typeof input === 'string') {
        if (input.length > HASHTAG_FOLLOWS_IMPORT_MAX_CHARS) {
          throw new MoleculerError('Imported hashtag payload is too large', 400, 'VALIDATION_ERROR');
        }

        const parsed = input
          .split(/[\n,\t ]+/)
          .map(item => item.trim())
          .filter(Boolean);

        if (parsed.length > HASHTAG_FOLLOWS_IMPORT_MAX_ITEMS) {
          throw new MoleculerError('Too many imported hashtags', 400, 'VALIDATION_ERROR');
        }

        return parsed;
      }

      throw new MoleculerError('tags must be an array or string', 400, 'VALIDATION_ERROR');
    },

    dedupeFollowedHashtags(hashtags) {
      const byTag = new Map();

      for (const item of hashtags) {
        if (!item || typeof item !== 'object') {
          continue;
        }

        const key = String(item.tag || '')
          .trim()
          .toLowerCase();
        if (!key) {
          continue;
        }

        byTag.set(key, {
          ...item,
          tag: key,
          displayTag: `#${key}`,
          notify: item.notify === undefined ? true : Boolean(item.notify),
          includeCrossProtocol: item.includeCrossProtocol === undefined ? true : Boolean(item.includeCrossProtocol),
          includeRelated: item.includeRelated === undefined ? true : Boolean(item.includeRelated),
          createdAt: typeof item.createdAt === 'string' ? item.createdAt : null
        });
      }

      return Array.from(byTag.values());
    },

    enforceFollowedHashtagLimit(hashtags) {
      const deduped = this.dedupeFollowedHashtags(hashtags);
      if (deduped.length > HASHTAG_FOLLOWS_MAX) {
        throw new MoleculerError(`Too many followed hashtags (max ${HASHTAG_FOLLOWS_MAX})`, 400, 'VALIDATION_ERROR');
      }

      return deduped;
    },

    async getFollowedHashtagsPreference(ctx, webId) {
      const preferences = await this.listByContainer(ctx, webId, 'preferences');
      const pref = preferences.find(item => item?.category === HASHTAG_FOLLOWS_PREF_CATEGORY);
      const raw = pref && typeof pref?.value === 'object' && pref.value ? pref.value : {};
      const hashtags = Array.isArray(raw.hashtags) ? raw.hashtags : [];

      const normalized = [];
      for (const item of hashtags) {
        if (!item || typeof item !== 'object') continue;
        let tag;
        try {
          tag = this.normalizeFollowedHashtagInput(String(item.tag || item.displayTag || ''));
        } catch {
          continue;
        }
        normalized.push({
          tag,
          displayTag: `#${tag}`,
          notify: item.notify === undefined ? true : Boolean(item.notify),
          includeCrossProtocol: item.includeCrossProtocol === undefined ? true : Boolean(item.includeCrossProtocol),
          includeRelated: item.includeRelated === undefined ? true : Boolean(item.includeRelated),
          createdAt: typeof item.createdAt === 'string' ? item.createdAt : null
        });
      }

      return {
        resourceUri: pref?.['@id'] || null,
        hashtags: this.sortFollowedHashtags(this.enforceFollowedHashtagLimit(normalized))
      };
    },

    async getFollowedHashtags(ctx, webId) {
      const pref = await this.getFollowedHashtagsPreference(ctx, webId);
      return pref.hashtags;
    },

    sortFollowedHashtags(hashtags) {
      return [...hashtags].sort((a, b) => String(a.tag || '').localeCompare(String(b.tag || '')));
    },

    async setFollowedHashtags(ctx, webId, hashtags) {
      const nextHashtags = this.sortFollowedHashtags(this.enforceFollowedHashtagLimit(hashtags));
      const existing = await this.getFollowedHashtagsPreference(ctx, webId);
      const value = {
        version: HASHTAG_FOLLOWS_VERSION,
        hashtags: nextHashtags,
        updatedAt: new Date().toISOString()
      };

      if (existing.resourceUri) {
        await ctx.call('ldp.resource.put', {
          resourceUri: existing.resourceUri,
          resource: {
            '@context': CONTEXT,
            type: this.resourceTypeForContainer('preferences'),
            category: HASHTAG_FOLLOWS_PREF_CATEGORY,
            value,
            updatedAt: value.updatedAt,
            createdAt: value.updatedAt
          },
          contentType: JSON_LD,
          webId
        });
        return nextHashtags;
      }

      await this.createSettingsResource(ctx, webId, 'preferences', {
        category: HASHTAG_FOLLOWS_PREF_CATEGORY,
        value
      });
      return nextHashtags;
    },

    async upsertFollowedHashtag(ctx, webId, hashtag, options) {
      const current = await this.getFollowedHashtags(ctx, webId);
      const byTag = new Map(current.map(item => [String(item.tag || '').toLowerCase(), item]));
      const key = hashtag.toLowerCase();
      const existing = byTag.get(key);

      byTag.set(key, {
        tag: hashtag,
        displayTag: `#${hashtag}`,
        notify: options.notify,
        includeCrossProtocol: options.includeCrossProtocol,
        includeRelated: options.includeRelated,
        createdAt: existing?.createdAt || new Date().toISOString()
      });

      const next = [...byTag.values()];
      return this.setFollowedHashtags(ctx, webId, next);
    },

    async removeFollowedHashtag(ctx, webId, hashtag) {
      const current = await this.getFollowedHashtags(ctx, webId);
      const key = hashtag.toLowerCase();
      const next = current.filter(item => String(item.tag || '').toLowerCase() !== key);
      return this.setFollowedHashtags(ctx, webId, next);
    },

    requireAtprotoIdentifier(value) {
      const identifier = String(value || '').trim();
      if (!identifier) {
        throw new MoleculerError('ATProto identifier is required', 400, 'ATPROTO_IDENTIFIER_REQUIRED');
      }
      return identifier;
    },

    requireAtprotoPassword(value) {
      const password = String(value || '').trim();
      if (!password) {
        throw new MoleculerError('ATProto app password is required', 400, 'ATPROTO_PASSWORD_REQUIRED');
      }
      return password;
    },

    clampInt(value, fallback, min, max) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) return fallback;
      return Math.min(max, Math.max(min, Math.trunc(numeric)));
    },

    async getAtprotoBindingForWebId(ctx, webId) {
      const binding = await ctx.call('identitybindings.getByCanonicalAccountId', {
        canonicalAccountId: webId
      });

      if (!binding?.atprotoDid || !binding?.atprotoPdsUrl) {
        throw new MoleculerError('No linked ATProto account found for this user', 404, 'ATPROTO_NOT_LINKED');
      }

      return binding;
    },

    async createAtprotoSession(pdsUrl, identifier, password) {
      const endpoint = new URL('/xrpc/com.atproto.server.createSession', pdsUrl).toString();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          identifier,
          password
        }),
        signal: AbortSignal.timeout(10000)
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const code =
          response.status === 401 || response.status === 403
            ? 'ATPROTO_EXTERNAL_AUTH_FAILED'
            : 'ATPROTO_SESSION_FAILED';
        throw new MoleculerError(
          payload?.message || `ATProto authentication failed (${response.status})`,
          response.status,
          code
        );
      }

      const accessJwt = typeof payload?.accessJwt === 'string' ? payload.accessJwt.trim() : '';
      if (!accessJwt) {
        throw new MoleculerError('ATProto session response missing accessJwt', 502, 'ATPROTO_SESSION_INVALID');
      }

      return {
        accessJwt
      };
    },

    async createManagedAtprotoSession(pdsUrl, canonicalAccountId) {
      const internalToken = String(process.env.ACTIVITYPODS_TOKEN || '').trim();
      if (!internalToken) {
        throw new MoleculerError(
          'Managed ATProto session mint is unavailable: missing ACTIVITYPODS_TOKEN',
          500,
          'ATPROTO_MANAGED_SESSION_UNAVAILABLE'
        );
      }

      const endpoint = new URL('/api/internal/atproto/session', pdsUrl).toString();
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          authorization: `Bearer ${internalToken}`
        },
        body: JSON.stringify({ canonicalAccountId }),
        signal: AbortSignal.timeout(10000)
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new MoleculerError(
          payload?.message || payload?.error || `Managed ATProto session mint failed (${response.status})`,
          response.status,
          'ATPROTO_MANAGED_SESSION_FAILED'
        );
      }

      const accessJwt = typeof payload?.accessJwt === 'string' ? payload.accessJwt.trim() : '';
      if (!accessJwt) {
        throw new MoleculerError('Managed ATProto session response missing accessJwt', 502, 'ATPROTO_SESSION_INVALID');
      }

      return { accessJwt };
    },

    async fetchAtprotoPreferences(pdsUrl, accessJwt) {
      const endpoint = new URL('/xrpc/app.bsky.actor.getPreferences', pdsUrl).toString();
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          authorization: `Bearer ${accessJwt}`
        },
        signal: AbortSignal.timeout(10000)
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new MoleculerError(
          payload?.message || `ATProto preferences fetch failed (${response.status})`,
          response.status,
          'ATPROTO_PREFERENCES_FETCH_FAILED'
        );
      }

      return Array.isArray(payload?.preferences) ? payload.preferences : [];
    },

    extractAtprotoLabelerDids(preferences) {
      const dids = new Set();

      const visit = value => {
        if (!value || typeof value !== 'object') return;

        if (Array.isArray(value)) {
          for (const item of value) visit(item);
          return;
        }

        if (Array.isArray(value.labelers)) {
          for (const labeler of value.labelers) {
            if (typeof labeler?.did === 'string' && labeler.did.trim().startsWith('did:')) {
              dids.add(labeler.did.trim().toLowerCase());
            }
          }
        }

        for (const nested of Object.values(value)) {
          if (nested && typeof nested === 'object') visit(nested);
        }
      };

      visit(preferences);
      return [...dids];
    },

    async fetchAtprotoModerationState(ctx, webId, binding) {
      const credentials = await this.resolveAtprotoSyncCredentials(ctx, webId, {}, binding);
      const pdsUrl = credentials.pdsUrl;

      const session =
        credentials.mode === 'managed-internal'
          ? await this.createManagedAtprotoSession(pdsUrl, webId)
          : await this.createAtprotoSession(pdsUrl, credentials.identifier, credentials.password);

      const mutes = await this.fetchAtprotoPagedList({
        pdsUrl,
        accessJwt: session.accessJwt,
        path: '/xrpc/app.bsky.graph.getMutes',
        listField: 'mutes',
        limit: 100,
        maxPages: 10
      });

      const blocks = await this.fetchAtprotoPagedList({
        pdsUrl,
        accessJwt: session.accessJwt,
        path: '/xrpc/app.bsky.graph.getBlocks',
        listField: 'blocks',
        limit: 100,
        maxPages: 10
      });

      const preferences = await this.fetchAtprotoPreferences(pdsUrl, session.accessJwt).catch(() => []);
      const labelerDids = this.extractAtprotoLabelerDids(preferences);

      return { mutes, blocks, labelerDids };
    },

    async fetchAtprotoPagedList({ pdsUrl, accessJwt, path, listField, limit, maxPages }) {
      let cursor = null;
      let page = 0;
      const items = [];

      while (page < maxPages) {
        const endpoint = new URL(path, pdsUrl);
        endpoint.searchParams.set('limit', String(limit));
        if (cursor) endpoint.searchParams.set('cursor', cursor);

        const response = await fetch(endpoint.toString(), {
          method: 'GET',
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${accessJwt}`
          },
          signal: AbortSignal.timeout(10000)
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new MoleculerError(
            payload?.message || `ATProto list fetch failed (${response.status})`,
            response.status,
            'ATPROTO_LIST_FETCH_FAILED'
          );
        }

        const pageItems = Array.isArray(payload?.[listField]) ? payload[listField] : [];
        items.push(...pageItems);

        cursor = typeof payload?.cursor === 'string' && payload.cursor.trim().length > 0 ? payload.cursor.trim() : null;
        page += 1;
        if (!cursor) break;
      }

      return items;
    },

    extractAtprotoSubjectId(item) {
      if (!item || typeof item !== 'object') return null;

      const did = typeof item.did === 'string' ? item.did.trim() : '';
      if (did) return did;

      const handle = typeof item.handle === 'string' ? item.handle.trim().toLowerCase() : '';
      if (handle) return handle;

      const actorDid = typeof item?.actor?.did === 'string' ? item.actor.did.trim() : '';
      if (actorDid) return actorDid;

      const actorHandle = typeof item?.actor?.handle === 'string' ? item.actor.handle.trim().toLowerCase() : '';
      if (actorHandle) return actorHandle;

      return null;
    },

    async createSettingsResource(ctx, webId, container, data) {
      const now = new Date().toISOString();
      const resource = {
        '@context': CONTEXT,
        type: this.resourceTypeForContainer(container),
        createdAt: now,
        updatedAt: now,
        ...data
      };

      return ctx.call('ldp.container.post', {
        containerUri: this.dataContainer(webId),
        resource,
        contentType: JSON_LD,
        webId
      });
    },

    async syncAtprotoSubjectsIntoContainer(ctx, webId, container, subjectIds, replace) {
      const canonicalIds = [...new Set(subjectIds.map(value => String(value || '').trim()).filter(Boolean))];
      const remoteSet = new Set(canonicalIds.map(value => value.toLowerCase()));
      const existing = await this.listByContainer(ctx, webId, container, { skipAtprotoMirror: true });

      const existingById = new Map();
      for (const item of existing) {
        if (String(item?.subjectProtocol || '').toLowerCase() !== 'atproto') continue;
        const key = String(item?.subjectCanonicalId || '')
          .trim()
          .toLowerCase();
        if (!key) continue;
        existingById.set(key, item);
      }

      let created = 0;
      let deleted = 0;

      for (const subjectCanonicalId of canonicalIds) {
        const key = subjectCanonicalId.toLowerCase();
        if (existingById.has(key)) continue;

        await this.createSettingsResource(ctx, webId, container, {
          subjectCanonicalId,
          subjectProtocol: 'atproto'
        });
        created += 1;
      }

      if (replace) {
        const dataset = getDatasetFromUri(webId);
        for (const [key, item] of existingById.entries()) {
          if (remoteSet.has(key)) continue;
          const resourceUri = item?.['@id'];
          if (!resourceUri) continue;
          await ctx.call('ldp.resource.delete', { resourceUri, webId }, { meta: { dataset } });
          deleted += 1;
        }
      }

      return {
        created,
        deleted,
        totalAfterSync: existingById.size + created - deleted
      };
    },

    async syncAtprotoLabelersIntoTrustSources(ctx, webId, labelerDids) {
      const remoteDids = [
        ...new Set(
          (labelerDids || [])
            .map(value =>
              String(value || '')
                .trim()
                .toLowerCase()
            )
            .filter(Boolean)
        )
      ];
      const remoteDidSet = new Set(remoteDids);

      const existing = await this.listByContainer(ctx, webId, 'trust-sources', {
        seedProviderDefaults: false,
        skipAtprotoMirror: true
      });

      const existingBySource = new Map();
      const syncedEntries = [];
      for (const item of existing) {
        const sourceType = String(item?.sourceType || '').toLowerCase();
        const source = String(item?.source || '')
          .trim()
          .toLowerCase();
        if (sourceType !== 'atproto-labeler' || !source) continue;

        existingBySource.set(source, item);
        if (String(item?.syncOrigin || '').toLowerCase() === ATPROTO_MIRROR_TRUST_SOURCE_MARKER) {
          syncedEntries.push(item);
        }
      }

      for (const did of remoteDids) {
        if (existingBySource.has(did)) continue;

        await this.createSettingsResource(ctx, webId, 'trust-sources', {
          source: did,
          sourceType: 'atproto-labeler',
          enabled: true,
          weight: 1,
          priority: 100,
          scopes: ['label:content', 'label:actor', 'filter:content', 'filter:actor'],
          name: `ATProto labeler ${did}`,
          description: 'Synced from ATProto account moderation preferences.',
          syncOrigin: ATPROTO_MIRROR_TRUST_SOURCE_MARKER
        });
      }

      const dataset = getDatasetFromUri(webId);
      for (const item of syncedEntries) {
        const source = String(item?.source || '')
          .trim()
          .toLowerCase();
        if (remoteDidSet.has(source)) continue;
        if (this.isDefaultBlueskyTrustSource(item)) continue;

        const resourceUri = item?.['@id'];
        if (!resourceUri) continue;
        await ctx.call('ldp.resource.delete', { resourceUri, webId }, { meta: { dataset } });
      }
    },

    requireWebIdParam(value) {
      if (typeof value !== 'string' || value.trim().length === 0) {
        throw new MoleculerError('webId is required', 400, 'VALIDATION_ERROR');
      }

      const webId = value.trim();
      try {
        const parsed = new URL(webId);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('invalid protocol');
        }
      } catch {
        throw new MoleculerError('webId must be a valid http(s) URI', 400, 'VALIDATION_ERROR');
      }

      return webId;
    },

    async buildMonthlyModerationSummary(ctx, webId) {
      const [filters, mutes, blocks, preferences] = await Promise.all([
        this.listByContainer(ctx, webId, 'filters'),
        this.listByContainer(ctx, webId, 'mutes'),
        this.listByContainer(ctx, webId, 'blocks'),
        this.listByContainer(ctx, webId, 'preferences')
      ]);

      const now = Date.now();
      const activeFilters = filters.filter(filter => {
        const expiresAt = Date.parse(filter?.expiresAt || '');
        if (Number.isNaN(expiresAt)) return true;
        return expiresAt > now;
      });

      const actionTotals = filters.reduce(
        (totals, filter) => {
          const action = String(filter?.action || 'hide');
          if (action === 'hide' || action === 'warn' || action === 'filter') {
            totals[action] += 1;
          }
          return totals;
        },
        { hide: 0, warn: 0, filter: 0 }
      );

      const sensitiveMediaModePreference = preferences.find(item => item?.category === 'sensitive-media-display');
      const sensitiveMediaMode =
        typeof sensitiveMediaModePreference?.value === 'string' ? sensitiveMediaModePreference.value : 'warn';

      return {
        generatedAt: new Date().toISOString(),
        period: this.currentSummaryPeriod(),
        filters: {
          total: filters.length,
          active: activeFilters.length,
          actions: actionTotals
        },
        mutes: {
          total: mutes.length
        },
        blocks: {
          total: blocks.length
        },
        sensitiveContent: {
          mediaDisplayMode: sensitiveMediaMode
        }
      };
    },

    currentSummaryPeriod() {
      const now = new Date();
      const year = now.getUTCFullYear();
      const month = now.getUTCMonth();
      const start = new Date(Date.UTC(year, month, 1, 0, 0, 0)).toISOString();
      const end = new Date(Date.UTC(year, month + 1, 1, 0, 0, 0)).toISOString();
      return { start, end };
    },

    async isMonthlySummaryEnabled(ctx, webId) {
      const preferences = await this.listByContainer(ctx, webId, 'preferences');
      const preference = preferences.find(item => item?.category === 'moderation-monthly-summary');
      if (!preference) return true;
      return Boolean(preference.value);
    },

    async dispatchMonthlyModerationSummaryInternal(ctx, webId, { force, reason }) {
      const enabled = await this.isMonthlySummaryEnabled(ctx, webId);
      if (!enabled && !force) {
        return {
          delivered: false,
          skipped: true,
          reason: 'disabled'
        };
      }

      const summary = await this.buildMonthlyModerationSummary(ctx, webId);

      const title = 'Your monthly moderation summary';
      const contentLines = [
        `Period start: ${summary.period.start}`,
        `Period end: ${summary.period.end}`,
        '',
        `Keyword filters: ${summary.filters.active} active (${summary.filters.total} total)`,
        `Filter actions: hide=${summary.filters.actions.hide}, warn=${summary.filters.actions.warn}, filter=${summary.filters.actions.filter}`,
        `Muted accounts: ${summary.mutes.total}`,
        `Blocked accounts: ${summary.blocks.total}`,
        `Sensitive media mode: ${summary.sensitiveContent.mediaDisplayMode}`
      ];

      try {
        await ctx.call('mail-notifications.notify', {
          template: {
            title,
            content: contentLines.join('\n')
          },
          recipientUri: webId,
          activity: {
            actor: webId,
            type: 'apods:ModerationSummary',
            id: `urn:activitypods:moderation-summary:${ulid()}`
          },
          reason
        });

        return {
          delivered: true,
          skipped: false,
          reason,
          summary
        };
      } catch (error) {
        this.logger.warn('[ModerationSummary] Failed to deliver monthly moderation summary', {
          webId,
          reason,
          error: error?.message
        });

        return {
          delivered: false,
          skipped: false,
          reason,
          error: error?.message || 'delivery_failed',
          summary
        };
      }
    },

    async listByContainer(ctx, webId, container, options = {}) {
      if (options.skipAtprotoMirror !== true) {
        await this.maybeSyncAtprotoModerationMirror(ctx, webId, container);
      }

      if (
        container === 'trust-sources' &&
        options.seedProviderDefaults !== false &&
        this.isProviderActor(webId) &&
        this.settings.blueskyDefaultLabelerEnabled
      ) {
        await this.ensureDefaultBlueskyTrustSource(ctx, webId);
      }

      const resourceClassUri = RESOURCE_CLASS_URI_BY_CONTAINER[container];
      const dataset = getDatasetFromUri(webId);
      const dataBase = this.dataContainer(webId);

      const rows = await ctx.call('triplestore.query', {
        query: sanitizeSparqlQuery`
          SELECT DISTINCT ?resource
          WHERE {
            ?resource a <${resourceClassUri}> .
            FILTER(STRSTARTS(STR(?resource), "${dataBase}"))
          }
          ORDER BY DESC(?resource)
        `,
        dataset,
        webId: 'system'
      });

      const uris = rows.map(row => row?.resource?.value).filter(Boolean);

      const resources = await Promise.all(
        uris.map(async resourceUri => {
          try {
            return await ctx.call('ldp.resource.get', {
              resourceUri,
              webId,
              accept: JSON_LD,
              jsonContext: CONTEXT
            });
          } catch {
            return null;
          }
        })
      );

      return resources.filter(Boolean);
    },

    async maybeSyncAtprotoModerationMirror(ctx, webId, container) {
      if (!['mutes', 'blocks', 'trust-sources'].includes(container)) return;
      if (this._atprotoMirrorInFlightByWebId.has(webId)) return;

      const lastRunAtMs = this._atprotoMirrorLastRunByWebId.get(webId) || 0;
      const minIntervalMs = Math.max(30, Number(this.settings.atprotoMirrorMinIntervalSeconds) || 300) * 1000;
      if (Date.now() - lastRunAtMs < minIntervalMs) return;

      this._atprotoMirrorInFlightByWebId.add(webId);
      try {
        const binding = await this.getAtprotoBindingForWebId(ctx, webId).catch(() => null);
        if (!binding) return;

        const mirror = await this.fetchAtprotoModerationState(ctx, webId, binding).catch(() => null);
        if (!mirror) return;

        const muteIds = mirror.mutes.map(item => this.extractAtprotoSubjectId(item)).filter(Boolean);
        const blockIds = mirror.blocks.map(item => this.extractAtprotoSubjectId(item)).filter(Boolean);

        await this.syncAtprotoSubjectsIntoContainer(ctx, webId, 'mutes', muteIds, true);
        await this.syncAtprotoSubjectsIntoContainer(ctx, webId, 'blocks', blockIds, true);
        await this.syncAtprotoLabelersIntoTrustSources(ctx, webId, mirror.labelerDids);
      } finally {
        this._atprotoMirrorLastRunByWebId.set(webId, Date.now());
        this._atprotoMirrorInFlightByWebId.delete(webId);
      }
    },

    async ensure(ctx, webId, c) {
      const root = `${this.base(webId)}settings/`;
      await this.ensureOne(ctx, root, webId, 'Settings');

      const sub = `${root}${c}/`;
      await this.ensureOne(ctx, sub, webId, c);

      return sub;
    },

    async ensureOne(ctx, uri, webId, title) {
      try {
        await ctx.call('ldp.container.create', { containerUri: uri, title, webId });
      } catch (error) {
        if (error?.code !== 400 && error?.code !== 409) {
          throw error;
        }
      }
    },

    requireProvider(webId) {
      if (!this.isProviderActor(webId)) {
        throw new MoleculerError('Provider access is required', 403, 'PROVIDER_ACCESS_REQUIRED');
      }
    },

    enqueueProviderDataWrite(key, writer) {
      const previous = this._providerDataWriteChains.get(key) || Promise.resolve();
      const next = previous.catch(() => undefined).then(writer);
      const tracked = next.finally(() => {
        if (this._providerDataWriteChains.get(key) === tracked) {
          this._providerDataWriteChains.delete(key);
        }
      });
      this._providerDataWriteChains.set(key, tracked);
      return tracked;
    },

    async loadProviderData(key) {
      const filePath = path.join(this.settings.providerDataDir, `${key}.json`);
      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          return parsed;
        }
        this.logger.warn('[ProviderData] Ignoring non-array payload in %s', filePath);
        return [];
      } catch (err) {
        if (err?.code !== 'ENOENT') {
          this.logger.warn('[ProviderData] Failed to load %s: %s', filePath, err.message);
        }
        return [];
      }
    },

    async saveProviderData(key, data) {
      const dir = this.settings.providerDataDir;
      const filePath = path.join(dir, `${key}.json`);
      const serialized = JSON.stringify(data, null, 2);
      return this.enqueueProviderDataWrite(key, async () => {
        await fs.promises.mkdir(dir, { recursive: true });
        const tempSuffix = `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
        const tempPath = `${filePath}.${tempSuffix}.tmp`;

        try {
          await fs.promises.writeFile(tempPath, serialized, 'utf8');
          await fs.promises.rename(tempPath, filePath);
        } catch (err) {
          await fs.promises.unlink(tempPath).catch(() => undefined);
          throw err;
        }
      });
    },

    recordAuditEvent(actor, action, detail = {}) {
      const max = this.settings.auditLogMaxEntries;
      const entry = {
        id: ulid(),
        timestamp: new Date().toISOString(),
        actor,
        action,
        ...detail
      };
      this._auditLog.push(entry);
      if (this._auditLog.length > max) {
        this._auditLog = this._auditLog.slice(-max);
      }
      this.saveProviderData('audit-log', this._auditLog).catch(err => {
        this.logger.warn('[AuditLog] Failed to persist audit log:', err.message);
      });
    },

    async mrfProxyRaw({ method, path: reqPath, permission }) {
      if (!this.settings.mrfAdminToken) return null;

      const url = `${this.settings.mrfAdminBaseUrl}${reqPath}`;
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.settings.mrfAdminToken}`,
          'Content-Type': 'application/json',
          'X-Provider-Permissions': permission
        },
        signal: AbortSignal.timeout(this.settings.mrfTimeoutMs)
      });

      if (!response.ok) return null;
      const text = await response.text();
      return text ? this.tryParseJson(text) : null;
    },

    encryptAtprotoSecret(secret) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this._atprotoSyncEncryptionKey, iv);
      const ciphertext = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return Buffer.concat([iv, tag, ciphertext]).toString('base64url');
    },

    decryptAtprotoSecret(encoded) {
      const raw = Buffer.from(String(encoded || ''), 'base64url');
      if (raw.length <= 28) throw new Error('invalid_encrypted_secret');
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const ciphertext = raw.subarray(28);
      const decipher = crypto.createDecipheriv('aes-256-gcm', this._atprotoSyncEncryptionKey, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    },

    publicAtprotoSyncConfig(config) {
      return {
        enabled: Boolean(config?.enabled),
        replace: Boolean(config?.replace),
        intervalHours: this.clampInt(
          config?.intervalHours,
          DEFAULT_SYNC_INTERVAL_HOURS,
          MIN_SYNC_INTERVAL_HOURS,
          MAX_SYNC_INTERVAL_HOURS
        ),
        pdsUrl: config?.pdsUrl || null,
        identifier: config?.identifier || null,
        hasStoredSecret: Boolean(config?.encryptedSecret),
        lastSyncAt: config?.lastSyncAt || null,
        lastSyncError: config?.lastSyncError || null,
        updatedAt: config?.updatedAt || null
      };
    },

    async getAtprotoSyncConfigValue(ctx, webId) {
      const preferences = await this.listByContainer(ctx, webId, 'preferences');
      const pref = preferences.find(item => item?.category === ATPROTO_SYNC_PREF_CATEGORY);
      const raw = pref && typeof pref?.value === 'object' && pref.value ? pref.value : {};

      return {
        resourceUri: pref?.['@id'] || null,
        enabled: Boolean(raw.enabled),
        replace: raw.replace === undefined ? false : Boolean(raw.replace),
        intervalHours: this.clampInt(
          raw.intervalHours,
          DEFAULT_SYNC_INTERVAL_HOURS,
          MIN_SYNC_INTERVAL_HOURS,
          MAX_SYNC_INTERVAL_HOURS
        ),
        pdsUrl: typeof raw.pdsUrl === 'string' ? raw.pdsUrl : null,
        identifier: typeof raw.identifier === 'string' ? raw.identifier : null,
        encryptedSecret: typeof raw.encryptedSecret === 'string' ? raw.encryptedSecret : null,
        lastSyncAt: typeof raw.lastSyncAt === 'string' ? raw.lastSyncAt : null,
        lastSyncError: typeof raw.lastSyncError === 'string' ? raw.lastSyncError : null,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null
      };
    },

    async upsertAtprotoSyncConfig(ctx, webId, config) {
      const existing = await this.getAtprotoSyncConfigValue(ctx, webId);
      const value = {
        enabled: Boolean(config.enabled),
        replace: Boolean(config.replace),
        intervalHours: this.clampInt(
          config.intervalHours,
          DEFAULT_SYNC_INTERVAL_HOURS,
          MIN_SYNC_INTERVAL_HOURS,
          MAX_SYNC_INTERVAL_HOURS
        ),
        pdsUrl: config.pdsUrl || null,
        identifier: config.identifier || null,
        encryptedSecret: config.encryptedSecret || null,
        lastSyncAt: config.lastSyncAt || null,
        lastSyncError: config.lastSyncError || null,
        updatedAt: config.updatedAt || new Date().toISOString()
      };

      if (existing.resourceUri) {
        await ctx.call('ldp.resource.put', {
          resourceUri: existing.resourceUri,
          resource: {
            '@context': CONTEXT,
            type: this.resourceTypeForContainer('preferences'),
            category: ATPROTO_SYNC_PREF_CATEGORY,
            value,
            updatedAt: value.updatedAt,
            createdAt: existing.updatedAt || value.updatedAt
          },
          contentType: JSON_LD,
          webId
        });
        return existing.resourceUri;
      }

      return this.createSettingsResource(ctx, webId, 'preferences', {
        category: ATPROTO_SYNC_PREF_CATEGORY,
        value
      });
    },

    async resolveAtprotoSyncCredentials(ctx, webId, input, binding) {
      const isExternal = binding?.atprotoManaged === false || binding?.atprotoSource === 'external';
      const explicitIdentifier = typeof input?.identifier === 'string' ? input.identifier.trim() : '';
      const explicitPassword = typeof input?.password === 'string' ? input.password.trim() : '';
      const explicitPdsUrl = typeof input?.pdsUrl === 'string' ? input.pdsUrl.trim() : '';

      if (explicitIdentifier && explicitPassword) {
        return {
          mode: 'external-credentials',
          identifier: explicitIdentifier,
          password: explicitPassword,
          pdsUrl: this.normalizeHttpUrlOrDefault(explicitPdsUrl || binding.atprotoPdsUrl, binding.atprotoPdsUrl)
        };
      }

      if (!isExternal) {
        return {
          mode: 'managed-internal',
          pdsUrl: this.normalizeHttpUrlOrDefault(explicitPdsUrl || binding.atprotoPdsUrl, binding.atprotoPdsUrl)
        };
      }

      const config = await this.getAtprotoSyncConfigValue(ctx, webId);
      if (!config.enabled || !config.identifier || !config.encryptedSecret) {
        throw new MoleculerError(
          'ATProto credentials are required. Provide identifier/password or configure stored sync credentials first.',
          400,
          'ATPROTO_SYNC_CREDENTIALS_REQUIRED'
        );
      }

      return {
        mode: 'external-credentials',
        identifier: config.identifier,
        password: this.decryptAtprotoSecret(config.encryptedSecret),
        pdsUrl: this.normalizeHttpUrlOrDefault(
          explicitPdsUrl || config.pdsUrl || binding.atprotoPdsUrl,
          binding.atprotoPdsUrl
        )
      };
    },

    async buildAtprotoModerationForwardingPlan(ctx, caseRecord, { canonicalIntentId } = {}) {
      if (!caseRecord || caseRecord.source !== 'local-user-report') {
        return { status: 'skipped', reason: 'case_not_local_user_report' };
      }

      if (!caseRecord.requestedForwarding?.remote) {
        return { status: 'skipped', reason: 'not_requested' };
      }

      if (caseRecord.subject?.authoritativeProtocol !== 'at') {
        return { status: 'skipped', reason: 'authoritative_protocol_not_atproto' };
      }

      const reporterWebId = this.normalizeOptionalHttpUrl(caseRecord.reporter?.webId);
      if (!reporterWebId) {
        return { status: 'skipped', reason: 'reporter_webid_missing' };
      }

      let binding;
      try {
        binding = await this.getAtprotoBindingForWebId(ctx, reporterWebId);
      } catch (error) {
        this.logger.warn('[ModerationReport] ATProto reporter binding unavailable', {
          caseId: caseRecord.id,
          reporterWebId,
          error: error?.message
        });
        return { status: 'skipped', reason: 'reporter_atproto_identity_missing' };
      }

      let credentials;
      try {
        credentials = await this.resolveAtprotoSyncCredentials(ctx, reporterWebId, {}, binding);
      } catch (error) {
        this.logger.warn('[ModerationReport] ATProto reporter credentials unavailable', {
          caseId: caseRecord.id,
          reporterWebId,
          error: error?.message
        });
        return { status: 'skipped', reason: 'reporter_credentials_unavailable' };
      }

      let session;
      try {
        session = await this.createModerationReportingAtprotoSession({
          reporterWebId,
          binding,
          credentials
        });
      } catch (error) {
        this.logger.warn('[ModerationReport] Failed to create ATProto reporting session', {
          caseId: caseRecord.id,
          reporterWebId,
          error: error?.message
        });
        return { status: 'skipped', reason: 'reporter_session_unavailable' };
      }

      let labelerDid;
      try {
        labelerDid = await this.resolveAtprotoModerationServiceDid(ctx, reporterWebId);
      } catch (error) {
        this.logger.warn('[ModerationReport] Failed to resolve ATProto moderation service', {
          caseId: caseRecord.id,
          reporterWebId,
          error: error?.message
        });
        return { status: 'skipped', reason: 'moderation_service_resolution_failed' };
      }

      if (!labelerDid) {
        return { status: 'skipped', reason: 'no_moderation_service' };
      }

      let subjectPayload;
      try {
        subjectPayload = await this.buildAtprotoModerationSubject(caseRecord);
      } catch (error) {
        this.logger.warn('[ModerationReport] Failed to normalize ATProto moderation subject', {
          caseId: caseRecord.id,
          error: error?.message
        });
        return {
          status: 'skipped',
          reason: error?.code === 'VALIDATION_ERROR' ? 'invalid_subject' : 'subject_resolution_failed'
        };
      }

      const reasonType = this.mapCanonicalReasonTypeToAtproto(caseRecord.reasonType);
      const reason = this.normalizeOptionalTrimmedString(caseRecord.reason, 2000);

      return {
        status: 'ready',
        ...(canonicalIntentId ? { canonicalIntentId } : {}),
        serviceDid: labelerDid,
        pdsUrl: this.normalizeHttpUrlOrDefault(credentials.pdsUrl || binding.atprotoPdsUrl, binding.atprotoPdsUrl),
        accessJwt: session.accessJwt,
        reporterDid: binding.atprotoDid,
        ...(binding.atprotoHandle ? { reporterHandle: binding.atprotoHandle } : {}),
        ...(subjectPayload.subjectDid ? { subjectDid: subjectPayload.subjectDid } : {}),
        ...(subjectPayload.subjectAtUri ? { subjectAtUri: subjectPayload.subjectAtUri } : {}),
        request: {
          reasonType,
          ...(reason ? { reason } : {}),
          subject: subjectPayload.subject,
          modTool: this.buildAtprotoModerationToolMetadata(caseRecord.clientContext)
        }
      };
    },

    async createModerationReportingAtprotoSession({ reporterWebId, binding, credentials }) {
      const execute = async () => {
        return credentials.mode === 'managed-internal'
          ? await this.createManagedAtprotoSession(credentials.pdsUrl, binding.canonicalAccountId || reporterWebId)
          : await this.createAtprotoSession(credentials.pdsUrl, credentials.identifier, credentials.password);
      };

      return retryWithBackoff(execute, {
        maxRetries: 1,
        baseDelayMs: 150,
        maxDelayMs: 1500,
        retryIf: error => {
          const statusCode = [error?.statusCode, error?.status]
            .map(value => Number(value))
            .find(value => Number.isInteger(value) && value >= 100 && value <= 599);
          if (error?.code === 'ATPROTO_EXTERNAL_AUTH_FAILED' || error?.code === 'ATPROTO_MANAGED_SESSION_FAILED') {
            return statusCode === 429 || statusCode >= 500;
          }
          return error?.retryable !== false;
        }
      });
    },

    async resolveAtprotoModerationServiceDid(ctx, webId) {
      const candidates = await this.collectEnabledAtprotoModerationServices(ctx, webId);
      if (candidates.length === 0) {
        return this.settings.blueskyDefaultLabelerDid || null;
      }

      const highestPriority = Math.max(...candidates.map(item => Number(item.priority || 0)));
      const top = candidates.filter(item => Number(item.priority || 0) === highestPriority);
      if (top.length > 1) {
        const distinct = [...new Set(top.map(item => String(item.did || '').toLowerCase()).filter(Boolean))];
        if (distinct.length > 1) {
          return null;
        }
      }

      return top[0]?.did || null;
    },

    async collectEnabledAtprotoModerationServices(ctx, webId) {
      const trustSources = await this.listByContainer(ctx, webId, 'trust-sources', { seedProviderDefaults: false });
      return trustSources
        .filter(
          entry => String(entry?.sourceType || '').toLowerCase() === 'atproto-labeler' && entry?.enabled !== false
        )
        .map(entry => ({
          did: this.normalizeOptionalTrimmedString(entry?.source, 512),
          priority: Number.isFinite(Number(entry?.priority)) ? Number(entry.priority) : 0
        }))
        .filter(entry => Boolean(entry.did))
        .sort((left, right) => {
          if (left.priority !== right.priority) return right.priority - left.priority;
          return String(left.did).localeCompare(String(right.did));
        });
    },

    async buildAtprotoModerationSubject(caseRecord) {
      if (caseRecord.subject.kind === 'account') {
        const actor = caseRecord.subject.actor || {};
        let did = this.normalizeOptionalTrimmedString(actor.did, 512);

        if (!did && actor.handle) {
          const resolved = await this.resolveAtprotoHandleValue(actor.handle);
          did = resolved.did;
        }

        if (!did) {
          throw new MoleculerError('ATProto account reports require a resolvable DID', 400, 'VALIDATION_ERROR');
        }

        return {
          subject: { did },
          subjectDid: did
        };
      }

      const rawAtUri =
        this.normalizeOptionalTrimmedString(caseRecord.subject.object?.atUri, 2048) ||
        (String(caseRecord.subject.object?.canonicalObjectId || '')
          .trim()
          .startsWith('at://')
          ? String(caseRecord.subject.object.canonicalObjectId).trim()
          : null);
      const cid = this.normalizeOptionalTrimmedString(caseRecord.subject.object?.cid, 512);

      if (!rawAtUri) {
        throw new MoleculerError('ATProto record reports require an at:// URI', 400, 'VALIDATION_ERROR');
      }

      if (!cid) {
        throw new MoleculerError(
          'ATProto record reports require a CID for precise record reporting',
          400,
          'VALIDATION_ERROR'
        );
      }

      const parsed = this.parseAtUri(rawAtUri);
      return {
        subject: {
          uri: parsed.uri,
          cid
        },
        subjectDid: parsed.did,
        subjectAtUri: parsed.uri
      };
    },

    parseAtUri(value) {
      const candidate = String(value || '').trim();
      const match = /^at:\/\/([^/]+)\/([^/]+)\/([^/?#]+)$/.exec(candidate);
      if (!match) {
        throw new MoleculerError('Expected a valid at:// URI', 400, 'VALIDATION_ERROR');
      }

      return {
        uri: candidate,
        did: match[1],
        collection: match[2],
        rkey: match[3]
      };
    },

    mapCanonicalReasonTypeToAtproto(reasonType) {
      switch (String(reasonType || '').trim()) {
        case 'spam':
          return 'com.atproto.moderation.defs#reasonSpam';
        case 'harassment':
          return 'com.atproto.moderation.defs#reasonRude';
        case 'impersonation':
          return 'com.atproto.moderation.defs#reasonMisleading';
        case 'copyright':
        case 'illegal':
        case 'safety':
        case 'abuse':
          return 'com.atproto.moderation.defs#reasonViolation';
        default:
          return 'com.atproto.moderation.defs#reasonOther';
      }
    },

    buildAtprotoModerationToolMetadata(clientContext) {
      const app = this.normalizeOptionalTrimmedString(clientContext?.app, 64);
      const surface = this.normalizeOptionalTrimmedString(clientContext?.surface, 64);
      const toolName = app ? `activitypods/${app.toLowerCase()}` : 'activitypods/moderation';

      return {
        name: toolName,
        ...(surface
          ? {
              meta: {
                surface
              }
            }
          : {})
      };
    },

    async performConfiguredAtprotoSync(ctx, webId, { reason, force }) {
      const config = await this.getAtprotoSyncConfigValue(ctx, webId);
      const binding = await this.getAtprotoBindingForWebId(ctx, webId);
      const isExternal = binding?.atprotoManaged === false || binding?.atprotoSource === 'external';
      if (isExternal && !config.enabled && !force) {
        return { skipped: true, reason: 'disabled' };
      }

      if (isExternal && (!config.identifier || !config.encryptedSecret)) {
        return { skipped: true, reason: 'missing_credentials' };
      }

      const now = Date.now();
      const intervalMs =
        this.clampInt(
          config.intervalHours,
          DEFAULT_SYNC_INTERVAL_HOURS,
          MIN_SYNC_INTERVAL_HOURS,
          MAX_SYNC_INTERVAL_HOURS
        ) *
        60 *
        60 *
        1000;
      const lastSyncAtMs = config.lastSyncAt ? Date.parse(config.lastSyncAt) : 0;
      if (!force && lastSyncAtMs > 0 && now - lastSyncAtMs < intervalMs) {
        return {
          skipped: true,
          reason: 'not_due',
          nextDueAt: new Date(lastSyncAtMs + intervalMs).toISOString()
        };
      }

      try {
        const syncInput = {
          pdsUrl: config.pdsUrl || undefined,
          replace: config.replace,
          limit: 100,
          maxPages: 10
        };

        if (isExternal) {
          syncInput.identifier = config.identifier;
          syncInput.password = this.decryptAtprotoSecret(config.encryptedSecret);
        }

        const result = await this.actions.syncAtprotoUserLists(
          {
            data: syncInput
          },
          {
            parentCtx: ctx,
            meta: { ...ctx.meta, webId }
          }
        );

        if (!isExternal) {
          const mirror = await this.fetchAtprotoModerationState(ctx, webId, binding).catch(() => null);
          if (mirror) {
            await this.syncAtprotoLabelersIntoTrustSources(ctx, webId, mirror.labelerDids);
          }
        }

        await this.upsertAtprotoSyncConfig(ctx, webId, {
          ...config,
          lastSyncAt: new Date().toISOString(),
          lastSyncError: null,
          updatedAt: new Date().toISOString()
        });

        return {
          skipped: false,
          reason,
          result: result?.data || null
        };
      } catch (error) {
        await this.upsertAtprotoSyncConfig(ctx, webId, {
          ...config,
          lastSyncError: String(error?.message || 'sync_failed').slice(0, 500),
          updatedAt: new Date().toISOString()
        });

        return {
          skipped: false,
          reason,
          error: String(error?.message || 'sync_failed')
        };
      }
    },

    async runAtprotoAutoSyncSweep() {
      if (this._atprotoAutoSyncInFlight) return;
      this._atprotoAutoSyncInFlight = true;

      try {
        const accounts = await this.broker.call('auth.account.find').catch(() => []);
        for (const account of accounts) {
          const webId = account?.webId || account?.['@id'];
          if (!webId) continue;
          const fakeCtx = { meta: { webId }, call: (...args) => this.broker.call(...args) };
          await this.performConfiguredAtprotoSync(fakeCtx, webId, { reason: 'scheduled', force: false }).catch(
            () => null
          );
        }
      } finally {
        this._atprotoAutoSyncInFlight = false;
      }
    },

    async ensureDefaultBlueskyTrustSource(ctx, webId) {
      const existing = await this.listByContainer(ctx, webId, 'trust-sources', { seedProviderDefaults: false });
      const alreadyPresent = existing.some(item => {
        const sourceType = String(item?.sourceType || '').toLowerCase();
        const source = String(item?.source || '').toLowerCase();
        return (
          sourceType === 'atproto-labeler' &&
          (source === this.settings.blueskyDefaultLabelerDid.toLowerCase() ||
            source === this.settings.blueskyDefaultLabelerHandle.toLowerCase())
        );
      });

      if (alreadyPresent) return;

      let source = this.settings.blueskyDefaultLabelerDid;
      try {
        const resolved = await this.actions.resolveAtprotoHandle(
          { handle: this.settings.blueskyDefaultLabelerHandle },
          { parentCtx: ctx, meta: ctx.meta }
        );
        if (resolved?.data?.did) source = resolved.data.did;
      } catch {
        // Fallback to configured DID when handle resolution is unavailable.
      }

      await this.createSettingsResource(ctx, webId, 'trust-sources', {
        source,
        sourceType: 'atproto-labeler',
        enabled: true,
        weight: 1,
        scopes: ['label:content', 'label:actor', 'filter:content', 'filter:actor'],
        name: this.settings.blueskyDefaultLabelerName,
        description:
          'Primary pod-provider safety layer: CSAM detection, spam filtering, and legal-risk content screening via the Bluesky Moderation Service. Required for responsible operation.',
        priority: 100,
        schemaVersion: 1
      });
    },

    decodeHtmlEntities(value) {
      return String(value || '')
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ');
    },

    normalizeHtmlSnippet(value) {
      return this.decodeHtmlEntities(
        String(value || '')
          .replace(/<!--(?:.|\n|\r)*?-->/g, '')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
      )
        .replace(/\s+/g, ' ')
        .trim();
    },

    catalogKeysForAtprotoLabeler(entry) {
      const keys = new Set();
      for (const candidate of [entry?.source, entry?.did, entry?.handle]) {
        if (typeof candidate !== 'string') continue;
        const normalized = candidate.trim().toLowerCase();
        if (normalized) keys.add(normalized);
      }
      return [...keys];
    },

    parsePublicAtprotoLabelerDirectory(html) {
      const defaultScopes = ['label:content', 'label:actor', 'filter:content', 'filter:actor'];
      const pattern =
        /<div class="text-sm font-bold[^>]*">([\s\S]*?)<\/div><div class="bg-mauve-4[\s\S]*?<div class="text-xs text-gray-500">@(?:<!-- -->)?([\s\S]*?)<\/div>[\s\S]*?<a href="https:\/\/bsky\.app\/profile\/(did:[^"]+)" aria-label="View labeler"[\s\S]*?<\/a><\/div><\/div><p class="whitespace-pre-line break-words text-sm text-gray-500">([\s\S]*?)<\/p>/gi;

      const seen = new Set();
      const entries = [];
      let match;

      while ((match = pattern.exec(html)) !== null) {
        const name = this.normalizeHtmlSnippet(match[1]);
        const handle = this.normalizeHtmlSnippet(match[2]).replace(/^@+/, '');
        const did = String(match[3] || '').trim();
        const description = this.normalizeHtmlSnippet(match[4]);
        const dedupeKey = `${did.toLowerCase()}|${handle.toLowerCase()}`;

        if (!did || seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);

        const isDefault =
          did.toLowerCase() === this.settings.blueskyDefaultLabelerDid.toLowerCase() ||
          handle.toLowerCase() === this.settings.blueskyDefaultLabelerHandle.toLowerCase();

        entries.push({
          resourceUri: null,
          source: did,
          sourceType: 'atproto-labeler',
          name: name || handle || did,
          description: description || null,
          scopes: defaultScopes,
          enabled: true,
          installed: false,
          recommended: isDefault,
          immutable: false,
          handle: handle || null,
          did,
          syncOrigin: null,
          priority: isDefault ? 100 : 50,
          weight: 1,
          directorySource: 'bluesky-labelers.io',
          directoryRank: entries.length + 1
        });
      }

      return entries;
    },

    async fetchPublicAtprotoLabelerDirectory() {
      const now = Date.now();
      if (this._atprotoLabelerDirectoryCache.expiresAt > now) {
        return this._atprotoLabelerDirectoryCache.entries;
      }

      try {
        const response = await fetch(ATPROTO_LABELER_DIRECTORY_URL, {
          headers: {
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          signal: AbortSignal.timeout(7000)
        });

        if (!response.ok) {
          throw new Error(`Directory request failed (${response.status})`);
        }

        const html = await response.text();
        const entries = this.parsePublicAtprotoLabelerDirectory(html);

        this._atprotoLabelerDirectoryCache = {
          expiresAt: now + ATPROTO_LABELER_DIRECTORY_CACHE_TTL_MS,
          entries
        };

        return entries;
      } catch (error) {
        this.logger.warn(`[ATProto labelers] Failed to fetch public labeler directory: ${error.message}`);
        return this._atprotoLabelerDirectoryCache.entries || [];
      }
    },

    mergeAtprotoLabelerCatalogEntry(existing, incoming) {
      return {
        ...incoming,
        ...existing,
        name:
          existing?.name || incoming?.name || existing?.handle || incoming?.handle || existing?.did || incoming?.did,
        description: existing?.description || incoming?.description || null,
        scopes: Array.isArray(existing?.scopes) && existing.scopes.length > 0 ? existing.scopes : incoming?.scopes,
        recommended: Boolean(existing?.recommended || incoming?.recommended),
        immutable: Boolean(existing?.immutable || incoming?.immutable),
        installed: Boolean(existing?.installed || incoming?.installed),
        enabled: existing?.enabled !== undefined ? existing.enabled : incoming?.enabled !== false,
        handle: existing?.handle || incoming?.handle || null,
        did: existing?.did || incoming?.did || null,
        resourceUri: existing?.resourceUri || incoming?.resourceUri || null,
        syncOrigin: existing?.syncOrigin || incoming?.syncOrigin || null,
        priority: existing?.priority ?? incoming?.priority,
        weight: existing?.weight ?? incoming?.weight,
        directorySource: existing?.directorySource || incoming?.directorySource || null,
        directoryRank: existing?.directoryRank ?? incoming?.directoryRank
      };
    },

    async buildAtprotoLabelerCatalog(ctx, webId) {
      const trustSources = await this.listByContainer(ctx, webId, 'trust-sources', { seedProviderDefaults: false });
      const defaultScopes = ['label:content', 'label:actor', 'filter:content', 'filter:actor'];

      const entries = trustSources
        .filter(item => String(item?.sourceType || '').toLowerCase() === 'atproto-labeler')
        .map(item => {
          const isDefault = this.isDefaultBlueskyTrustSource(item);
          const source = String(item?.source || '').trim();

          return {
            resourceUri: item?.['@id'] || null,
            source,
            sourceType: 'atproto-labeler',
            name: item?.name || source,
            description: item?.description || null,
            scopes: Array.isArray(item?.scopes) && item.scopes.length > 0 ? item.scopes : defaultScopes,
            enabled: item?.enabled !== false,
            installed: true,
            recommended: isDefault,
            immutable: Boolean(this.isProviderActor(webId) && isDefault),
            handle: isDefault ? this.settings.blueskyDefaultLabelerHandle : null,
            did: source.startsWith('did:') ? source : isDefault ? this.settings.blueskyDefaultLabelerDid : null,
            syncOrigin: item?.syncOrigin || null,
            priority: item?.priority,
            weight: item?.weight
          };
        });

      const byKey = new Map();
      const indexEntry = entry => {
        for (const key of this.catalogKeysForAtprotoLabeler(entry)) {
          byKey.set(key, entry);
        }
      };

      entries.forEach(indexEntry);

      const hasDefault = entries.some(item => this.isDefaultBlueskyTrustSource(item));

      if (!hasDefault && this.settings.blueskyDefaultLabelerEnabled) {
        const defaultEntry = {
          resourceUri: null,
          source: this.settings.blueskyDefaultLabelerDid,
          sourceType: 'atproto-labeler',
          name: this.settings.blueskyDefaultLabelerName,
          description:
            'Primary pod-provider safety layer: CSAM detection, spam filtering, and legal-risk content screening via the Bluesky Moderation Service. Required for responsible operation.',
          scopes: defaultScopes,
          enabled: true,
          installed: false,
          recommended: true,
          immutable: false,
          handle: this.settings.blueskyDefaultLabelerHandle,
          did: this.settings.blueskyDefaultLabelerDid,
          syncOrigin: null,
          priority: 100,
          weight: 1
        };

        entries.unshift(defaultEntry);
        indexEntry(defaultEntry);
      }

      const publicEntries = await this.fetchPublicAtprotoLabelerDirectory();
      for (const publicEntry of publicEntries) {
        const existing = this.catalogKeysForAtprotoLabeler(publicEntry)
          .map(key => byKey.get(key))
          .find(Boolean);

        if (existing) {
          const merged = this.mergeAtprotoLabelerCatalogEntry(existing, publicEntry);
          Object.assign(existing, merged);
          indexEntry(existing);
          continue;
        }

        entries.push(publicEntry);
        indexEntry(publicEntry);
      }

      return entries.sort((left, right) => {
        if (left.recommended !== right.recommended) return left.recommended ? -1 : 1;
        if (left.installed !== right.installed) return left.installed ? -1 : 1;
        if ((left.directoryRank ?? Number.MAX_SAFE_INTEGER) !== (right.directoryRank ?? Number.MAX_SAFE_INTEGER)) {
          return (left.directoryRank ?? Number.MAX_SAFE_INTEGER) - (right.directoryRank ?? Number.MAX_SAFE_INTEGER);
        }
        return String(left.name || left.source).localeCompare(String(right.name || right.source));
      });
    },

    isDefaultBlueskyTrustSource(resource) {
      if (!resource || typeof resource !== 'object') return false;
      const sourceType = String(resource?.sourceType || '').toLowerCase();
      if (sourceType !== 'atproto-labeler') return false;
      const source = String(resource?.source || '').toLowerCase();
      return (
        source === this.settings.blueskyDefaultLabelerDid.toLowerCase() ||
        source === this.settings.blueskyDefaultLabelerHandle.toLowerCase()
      );
    }
  }
};
