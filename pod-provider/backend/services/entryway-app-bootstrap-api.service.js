const { MoleculerError } = require('moleculer').Errors;
const crypto = require('crypto');

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value) {
  return asArray(value)
    .flatMap(item => (typeof item === 'string' && item.includes(',') ? item.split(',') : [item]))
    .map(normalizeString)
    .filter(Boolean);
}

function parseApprovedApps(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];

  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed.apps)
      ? parsed.apps
      : Object.entries(parsed).map(([clientId, config]) => ({ clientId, ...(config || {}) }));

  return entries.map(entry => ({
    appClientId: normalizeString(entry.clientId || entry.appClientId || entry.appUri || entry.id),
    appUri: normalizeString(entry.appUri || entry.clientId || entry.appClientId || entry.id),
    acceptedAccessNeeds: normalizeStringArray([
      entry.acceptedAccessNeed,
      ...asArray(entry.acceptedAccessNeeds),
      ...asArray(entry.accessNeeds)
    ]),
    acceptedSpecialRights: normalizeStringArray([
      entry.acceptedSpecialRight,
      ...asArray(entry.acceptedSpecialRights),
      ...asArray(entry.specialRights)
    ]),
    sessionHandoff: entry.sessionHandoff && typeof entry.sessionHandoff === 'object'
      ? normalizeSessionHandoff(entry.sessionHandoff)
      : null
  })).filter(app => app.appClientId && app.appUri);
}

function normalizeSessionHandoff(value) {
  const type = value.type === 'redirect' ? 'redirect' : value.type === 'handoff' ? 'handoff' : '';
  if (!type) return null;

  return {
    type,
    url: normalizeString(value.url) || undefined,
    handoffId: normalizeString(value.handoffId) || undefined,
    expiresAt: normalizeString(value.expiresAt) || undefined
  };
}

function timingSafeEquals(a, b) {
  if (!a || !b) return false;
  const left = Buffer.from(String(a), 'utf8');
  const right = Buffer.from(String(b), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  name: 'entryway-app-bootstrap-api',
  dependencies: ['api', 'app-registrations', 'access-grants'],

  settings: {
    enabled: parseBoolean(process.env.ENTRYWAY_APP_BOOTSTRAP_PROVIDER_ENABLED, false),
    internalBearerToken: process.env.ACTIVITYPODS_TOKEN || '',
    approvedApps: parseApprovedApps(process.env.ENTRYWAY_APP_BOOTSTRAP_APPS_JSON || '[]')
  },

  async started() {
    if (!this.settings.enabled) {
      this.logger.info('[EntrywayAppBootstrap] Provider bootstrap endpoint disabled');
      return;
    }

    await this.broker.call('api.addRoute', {
      route: {
        name: 'entryway-app-bootstrap-api',
        path: '/api/internal/entryway',
        authorization: false,
        authentication: false,
        bodyParsers: { json: { strict: false } },
        onBeforeCall(ctx, route, req) {
          ctx.meta.$headers = req.headers;
        },
        aliases: {
          'POST /app-bootstrap': 'entryway-app-bootstrap-api.bootstrap'
        }
      },
      toBottom: false
    });

    this.logger.info('[EntrywayAppBootstrap] Internal route registered under /api/internal/entryway');
  },

  actions: {
    bootstrap: {
      params: {
        accountId: { type: 'string', optional: true },
        canonicalAccountId: { type: 'string', min: 1 },
        username: { type: 'string', optional: true },
        webId: { type: 'string', min: 1 },
        actorId: { type: 'string', optional: true },
        podStorageUrl: { type: 'string', optional: true },
        providerId: { type: 'string', optional: true },
        appClientId: { type: 'string', min: 1 },
        redirectUri: { type: 'string', optional: true },
        atprotoDid: { type: 'string', optional: true },
        atprotoHandle: { type: 'string', optional: true }
      },
      async handler(ctx) {
        if (!this.settings.enabled) {
          throw new MoleculerError('Entryway app bootstrap is disabled', 404, 'ENTRYWAY_APP_BOOTSTRAP_DISABLED');
        }

        this.assertInternalBearer(ctx);

        const webId = this.assertAbsoluteHttpUrl(ctx.params.webId, 'webId');
        const canonicalAccountId = this.assertAbsoluteHttpUrl(ctx.params.canonicalAccountId, 'canonicalAccountId');
        if (canonicalAccountId !== webId) {
          throw new MoleculerError('canonicalAccountId must match webId for current bootstrap path', 400, 'IDENTITY_MISMATCH');
        }

        const appConfig = this.findApprovedApp(ctx.params.appClientId);
        if (!appConfig) {
          throw new MoleculerError('App is not approved for Entryway bootstrap', 403, 'UNAUTHORIZED_APP');
        }

        const appRegistrationUri = await ctx.call('app-registrations.createOrUpdate', {
          appUri: appConfig.appUri,
          podOwner: webId,
          acceptedAccessNeeds: appConfig.acceptedAccessNeeds,
          acceptedSpecialRights: appConfig.acceptedSpecialRights
        });

        const accessGrants = await ctx.call('access-grants.getForApp', {
          appUri: appConfig.appUri,
          podOwner: webId
        });

        return {
          appRegistrationUri,
          accessGrantUris: asArray(accessGrants)
            .map(grant => normalizeString(grant?.id || grant?.['@id'] || grant))
            .filter(Boolean),
          bootstrappedAt: new Date().toISOString(),
          ...(appConfig.sessionHandoff ? { sessionHandoff: appConfig.sessionHandoff } : {})
        };
      }
    }
  },

  methods: {
    assertInternalBearer(ctx) {
      const expected = String(this.settings.internalBearerToken || '').trim();
      if (!expected) {
        throw new MoleculerError('Internal bootstrap token is not configured', 503, 'BOOTSTRAP_AUTH_NOT_CONFIGURED');
      }

      const header = normalizeString(ctx.meta?.$headers?.authorization || ctx.meta?.$headers?.Authorization);
      const actual = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : '';
      if (!timingSafeEquals(actual, expected)) {
        throw new MoleculerError('Unauthorized', 401, 'UNAUTHORIZED');
      }
    },

    findApprovedApp(appClientId) {
      const normalized = normalizeString(appClientId);
      return this.settings.approvedApps.find(app => app.appClientId === normalized || app.appUri === normalized);
    },

    assertAbsoluteHttpUrl(value, field) {
      const normalized = normalizeString(value);
      let parsed;
      try {
        parsed = new URL(normalized);
      } catch (_error) {
        throw new MoleculerError(`${field} must be an absolute HTTP URL`, 400, 'INVALID_REQUEST');
      }

      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new MoleculerError(`${field} must be an absolute HTTP URL without credentials`, 400, 'INVALID_REQUEST');
      }

      return parsed.toString();
    }
  }
};
