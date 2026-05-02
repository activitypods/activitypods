const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;

const ACCOUNT_PROVISIONING_CAPABILITY = 'provider.account.provisioning';

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function splitCsv(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
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
    .flatMap(item => (typeof item === 'string' && item.includes(',') ? splitCsv(item) : [item]))
    .map(normalizeString)
    .filter(Boolean);
}

function parseApprovedApps(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed.apps)
        ? parsed.apps
        : Object.entries(parsed).map(([clientId, config]) => ({ clientId, ...(config || {}) }));

    return entries.map(normalizeApprovedApp).filter(app => app.clientId);
  } catch (_error) {
    return splitCsv(raw).map(clientId => normalizeApprovedApp({ clientId }));
  }
}

function normalizeApprovedApp(entry) {
  if (typeof entry === 'string') {
    return {
      clientId: entry.trim(),
      bearerTokens: [],
      verificationTokens: [],
      allowedOrigins: [],
      allowedRedirectUris: [],
      allowAtproto: true,
      allowUnsigned: false,
      maxAccountsPerDay: null
    };
  }

  const bearerTokens = normalizeStringArray([
    entry.bearerToken,
    entry.token,
    entry.signupToken,
    ...asArray(entry.bearerTokens),
    ...asArray(entry.tokens),
    ...asArray(entry.signupTokens)
  ]);

  return {
    clientId: normalizeString(entry.clientId || entry.appClientId || entry.id || entry.appUri),
    bearerTokens,
    verificationTokens: normalizeStringArray([
      entry.verificationToken,
      ...asArray(entry.verificationTokens)
    ]),
    allowedOrigins: normalizeStringArray([
      entry.origin,
      ...asArray(entry.allowedOrigins),
      ...asArray(entry.origins)
    ]),
    allowedRedirectUris: normalizeStringArray([
      entry.redirectUri,
      ...asArray(entry.allowedRedirectUris),
      ...asArray(entry.redirectUris)
    ]),
    allowAtproto: entry.allowAtproto !== false,
    allowUnsigned: entry.allowUnsigned === true,
    maxAccountsPerDay: Number.isFinite(Number(entry.maxAccountsPerDay))
      ? Number(entry.maxAccountsPerDay)
      : null
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
  name: 'provider-capabilities',

  settings: {
    schemaVersion: '1.0.0',
    providerId: process.env.PROVIDER_ID || process.env.SEMAPPS_HOME_URL || 'activitypods-provider',
    providerDisplayName:
      process.env.PROVIDER_DISPLAY_NAME || process.env.SEMAPPS_INSTANCE_NAME || 'ActivityPods Provider',
    providerRegion: process.env.PROVIDER_REGION || 'local',
    providerProfile: process.env.PROVIDER_CAPABILITIES_PROFILE || null,
    atprotoEnabled: parseBoolean(process.env.PROVIDER_ATPROTO_ENABLED, true),
    accountProvisioningEnabled: parseBoolean(process.env.PROVIDER_ACCOUNT_PROVISIONING_ENABLED, true),
    requiresApprovedApps: parseBoolean(process.env.PROVIDER_ACCOUNT_PROVISIONING_APPROVED_APPS_REQUIRED, true),
    requiresUserVerification: parseBoolean(process.env.PROVIDER_ACCOUNT_PROVISIONING_REQUIRES_USER_VERIFICATION, true),
    requireBearerToken: parseBoolean(process.env.PROVIDER_ACCOUNT_PROVISIONING_REQUIRES_BEARER, true),
    allowTrustedVerification: parseBoolean(process.env.PROVIDER_ACCOUNT_PROVISIONING_ALLOW_TRUSTED_VERIFICATION, false),
    maxAccountsPerAppPerDay: parseInteger(process.env.PROVIDER_ACCOUNT_PROVISIONING_MAX_ACCOUNTS_PER_APP_PER_DAY, 250, 1, 100000),
    grantTtlMs: parseInteger(process.env.PROVIDER_ACCOUNT_PROVISIONING_GRANT_TTL_MS, 5 * 60 * 1000, 1000, 60 * 60 * 1000),
    requireIdempotencyKey: parseBoolean(process.env.PROVIDER_ACCOUNT_PROVISIONING_REQUIRE_IDEMPOTENCY_KEY, true),
    idempotencyTtlMs: parseInteger(
      process.env.PROVIDER_ACCOUNT_PROVISIONING_IDEMPOTENCY_TTL_MS,
      24 * 60 * 60 * 1000,
      60 * 1000,
      7 * 24 * 60 * 60 * 1000
    ),
    idempotencyMaxEntries: parseInteger(
      process.env.PROVIDER_ACCOUNT_PROVISIONING_IDEMPOTENCY_MAX_ENTRIES,
      10000,
      100,
      1000000
    ),
    approvedApps: parseApprovedApps(
      process.env.PROVIDER_ACCOUNT_PROVISIONING_APPROVED_APPS_JSON ||
        process.env.PROVIDER_ACCOUNT_PROVISIONING_APPROVED_APPS ||
        ''
    ),
    verificationTokens: normalizeStringArray(process.env.PROVIDER_ACCOUNT_PROVISIONING_VERIFICATION_TOKENS),
    verificationSecret: process.env.PROVIDER_ACCOUNT_PROVISIONING_VERIFICATION_SECRET || ''
  },

  created() {
    this.idempotencyRecords = new Map();
    this.dailyUsage = new Map();
  },

  actions: {
    getDocument: {
      handler() {
        return this.buildDocument();
      }
    },

    evaluateAccountProvisioning: {
      params: {
        appClientId: { type: 'string', optional: true },
        authorization: { type: 'string', optional: true },
        origin: { type: 'string', optional: true },
        redirectUri: { type: 'string', optional: true },
        idempotencyKey: { type: 'string', optional: true },
        username: { type: 'string', optional: true },
        email: { type: 'string', optional: true },
        requestedProtocols: { type: 'object', optional: true, strict: false },
        verification: { type: 'object', optional: true, strict: false }
      },
      handler(ctx) {
        return this.evaluateAccountProvisioning(ctx.params);
      }
    },

    authorizeAccountProvisioning: {
      params: {
        appClientId: { type: 'string', optional: true },
        authorization: { type: 'string', optional: true },
        origin: { type: 'string', optional: true },
        redirectUri: { type: 'string', optional: true },
        idempotencyKey: { type: 'string', optional: true },
        username: { type: 'string', optional: true },
        email: { type: 'string', optional: true },
        requestedProtocols: { type: 'object', optional: true, strict: false },
        verification: { type: 'object', optional: true, strict: false }
      },
      handler(ctx) {
        const result = this.evaluateAccountProvisioning(ctx.params);
        if (!result.allowed) {
          this.throwDenied(result);
        }
        return result;
      }
    },

    reserveAccountProvisioning: {
      params: {
        appClientId: { type: 'string', optional: true },
        authorization: { type: 'string', optional: true },
        origin: { type: 'string', optional: true },
        redirectUri: { type: 'string', optional: true },
        idempotencyKey: { type: 'string', optional: true },
        requestFingerprint: { type: 'string', optional: true },
        username: { type: 'string', optional: true },
        email: { type: 'string', optional: true },
        requestedProtocols: { type: 'object', optional: true, strict: false },
        verification: { type: 'object', optional: true, strict: false }
      },
      handler(ctx) {
        const result = this.reserveAccountProvisioning(ctx.params);
        if (!result.allowed) {
          this.throwDenied(result);
        }
        return result;
      }
    },

    completeAccountProvisioning: {
      params: {
        grant: { type: 'object', optional: true, strict: false },
        response: { type: 'object', optional: true, strict: false },
        statusCode: { type: 'number', optional: true }
      },
      handler(ctx) {
        return this.completeAccountProvisioning(ctx.params.grant || {}, ctx.params.response || {}, ctx.params.statusCode);
      }
    },

    failAccountProvisioning: {
      params: {
        grant: { type: 'object', optional: true, strict: false },
        reasonCode: { type: 'string', optional: true },
        message: { type: 'string', optional: true }
      },
      handler(ctx) {
        return this.failAccountProvisioning(ctx.params.grant || {}, {
          reasonCode: ctx.params.reasonCode,
          message: ctx.params.message
        });
      }
    },

    assertAccountProvisioningGrant: {
      params: {
        grant: { type: 'object', optional: true, strict: false },
        requestedProtocols: { type: 'object', optional: true, strict: false }
      },
      handler(ctx) {
        const result = this.assertGrant(ctx.params.grant || {}, ctx.params.requestedProtocols || {});
        if (!result.allowed) {
          this.throwDenied(result);
        }
        return result;
      }
    }
  },

  methods: {
    buildDocument() {
      const profile = this.getProviderProfile();
      const accountCapability = this.buildAccountProvisioningCapability();

      return {
        schemaVersion: this.settings.schemaVersion,
        provider: {
          id: this.settings.providerId,
          displayName: this.settings.providerDisplayName,
          region: this.settings.providerRegion
        },
        profiles: {
          active: [profile],
          supported: ['ap-core', 'ap-scale', 'dual-protocol-standard']
        },
        protocols: {
          activitypub: {
            enabled: true,
            version: '1.0',
            status: 'enabled'
          },
          atproto: this.settings.atprotoEnabled
            ? {
                enabled: true,
                version: '1.0',
                status: 'enabled'
              }
            : {
                enabled: false,
                status: 'disabled',
                disabledReason: 'provider_policy'
              }
        },
        capabilities: [accountCapability],
        entitlements: {
          plan: process.env.PROVIDER_PLAN || 'standard',
          effectiveAt: new Date().toISOString(),
          overrides: []
        },
        degradation: { modes: [] },
        events: {
          catalogVersion: '1.0.0',
          topics: []
        },
        security: {
          internalApisAuth: 'bearer',
          signingKeysLocation: 'activitypods-only',
          failClosed: true
        }
      };
    },

    buildAccountProvisioningCapability() {
      const enabled = this.settings.accountProvisioningEnabled === true;
      return {
        id: ACCOUNT_PROVISIONING_CAPABILITY,
        version: '1.0.0',
        status: enabled ? 'enabled' : 'disabled',
        dependencies: [],
        limits: {
          approvedAppsRequired: this.settings.requiresApprovedApps === true,
          requiresUserVerification: this.settings.requiresUserVerification === true,
          maxAccountsPerAppPerDay: this.settings.maxAccountsPerAppPerDay,
          supportedProtocolSet: this.settings.atprotoEnabled
            ? 'solid,activitypub,atproto'
            : 'solid,activitypub'
        },
        ...(enabled ? {} : { disabledReason: 'provider_policy' })
      };
    },

    getProviderProfile() {
      return this.settings.providerProfile || (this.settings.atprotoEnabled ? 'dual-protocol-standard' : 'ap-scale');
    },

    evaluateAccountProvisioning(input) {
      if (!this.settings.accountProvisioningEnabled) {
        return this.deny('feature_disabled', 'Account provisioning is disabled for this provider profile', false, 403);
      }

      const requestedProtocols = this.normalizeRequestedProtocols(input.requestedProtocols || {});
      if (requestedProtocols.atproto && !this.settings.atprotoEnabled) {
        return this.deny('protocol_disabled', 'ATProto provisioning is disabled by provider policy', false, 403);
      }

      const appClientId = normalizeString(input.appClientId);
      const app = this.findApprovedApp(appClientId);

      if (this.settings.requiresApprovedApps) {
        if (!app) {
          return this.deny('unauthorized_app', 'Account provisioning is only available to approved applications', false, 403);
        }

        if (!this.verifyAppAuthorization(app, input.authorization)) {
          return this.deny('unauthorized_app', 'Approved application authorization is required for account provisioning', false, 403);
        }

        if (!this.matchesAllowedValue(app.allowedOrigins, input.origin)) {
          return this.deny('unauthorized_app', 'Application origin is not approved for account provisioning', false, 403);
        }

        if (!this.matchesAllowedValue(app.allowedRedirectUris, input.redirectUri)) {
          return this.deny('unauthorized_app', 'Application redirect URI is not approved for account provisioning', false, 403);
        }

        if (requestedProtocols.atproto && app.allowAtproto === false) {
          return this.deny('protocol_disabled', 'Approved application is not allowed to request ATProto provisioning', false, 403);
        }
      }

      const verifiedUser = this.verifyUser(input, app);
      if (!verifiedUser) {
        return this.deny('user_verification_required', 'Account provisioning requires user verification', true, 403);
      }

      const now = new Date().toISOString();
      return {
        allowed: true,
        capabilityId: ACCOUNT_PROVISIONING_CAPABILITY,
        providerProfile: this.getProviderProfile(),
        appClientId,
        approvedApp: !this.settings.requiresApprovedApps || Boolean(app),
        verifiedUser: true,
        verificationMethod: normalizeString(input.verification?.method) || 'provider_policy',
        requestedProtocols,
        idempotencyKey: normalizeString(input.idempotencyKey) || null,
        requestFingerprint: normalizeString(input.requestFingerprint) || null,
        issuedAt: now,
        retryable: false
      };
    },

    reserveAccountProvisioning(input) {
      this.pruneIdempotencyRecords();

      const authorization = this.evaluateAccountProvisioning(input);
      if (!authorization.allowed) {
        return authorization;
      }

      const idempotencyKey = normalizeString(input.idempotencyKey);
      if (this.settings.requireIdempotencyKey && !idempotencyKey) {
        return this.deny(
          'idempotency_key_required',
          'Idempotency-Key is required for account provisioning',
          true,
          400
        );
      }

      if (!idempotencyKey) {
        return authorization;
      }

      const appClientId = authorization.appClientId || 'provider';
      const idempotencyRecordKey = this.buildIdempotencyRecordKey(appClientId, idempotencyKey);
      const requestFingerprint = normalizeString(input.requestFingerprint) || this.fingerprintProvisioningRequest(input);
      const existing = this.idempotencyRecords.get(idempotencyRecordKey);

      if (existing && existing.expiresAt > Date.now()) {
        if (existing.requestFingerprint !== requestFingerprint) {
          return this.deny(
            'idempotency_key_conflict',
            'Idempotency-Key has already been used with a different account provisioning request',
            false,
            409
          );
        }

        if (existing.status === 'completed') {
          return {
            ...authorization,
            idempotency: {
              key: idempotencyKey,
              state: 'completed',
              replay: true,
              response: existing.response,
              statusCode: existing.statusCode || 201
            }
          };
        }

        if (existing.status === 'in_progress') {
          return this.deny(
            'idempotency_request_in_progress',
            'Account provisioning is already in progress for this Idempotency-Key',
            true,
            409
          );
        }
      }

      const app = this.findApprovedApp(appClientId);
      const dailyLimit = this.resolveDailyLimit(app);
      const usage = this.reserveDailyUsage(appClientId, dailyLimit);
      if (!usage.allowed) {
        return this.deny(
          'limit_exceeded',
          `Approved application exceeded account provisioning limit of ${dailyLimit} accounts per day`,
          true,
          429
        );
      }

      const now = Date.now();
      const expiresAt = now + this.settings.idempotencyTtlMs;
      this.idempotencyRecords.set(idempotencyRecordKey, {
        key: idempotencyKey,
        appClientId,
        requestFingerprint,
        status: 'in_progress',
        createdAt: now,
        updatedAt: now,
        expiresAt,
        usageDay: usage.day
      });
      this.enforceIdempotencyMaxEntries();

      return {
        ...authorization,
        idempotencyKey,
        requestFingerprint,
        idempotency: {
          key: idempotencyKey,
          state: 'reserved',
          replay: false
        }
      };
    },

    completeAccountProvisioning(grant, response, statusCode) {
      const idempotencyKey = normalizeString(grant.idempotencyKey || grant.idempotency?.key);
      const appClientId = normalizeString(grant.appClientId) || 'provider';
      if (!idempotencyKey) return { ok: true, stored: false };

      const recordKey = this.buildIdempotencyRecordKey(appClientId, idempotencyKey);
      const existing = this.idempotencyRecords.get(recordKey);
      if (!existing) return { ok: true, stored: false };

      const now = Date.now();
      this.idempotencyRecords.set(recordKey, {
        ...existing,
        status: 'completed',
        response,
        statusCode: Number.isFinite(Number(statusCode)) ? Number(statusCode) : 201,
        updatedAt: now,
        completedAt: now,
        expiresAt: now + this.settings.idempotencyTtlMs
      });

      return { ok: true, stored: true };
    },

    failAccountProvisioning(grant, failure) {
      const idempotencyKey = normalizeString(grant.idempotencyKey || grant.idempotency?.key);
      const appClientId = normalizeString(grant.appClientId) || 'provider';
      if (!idempotencyKey) return { ok: true, stored: false };

      const recordKey = this.buildIdempotencyRecordKey(appClientId, idempotencyKey);
      const existing = this.idempotencyRecords.get(recordKey);
      if (!existing || existing.status === 'completed') return { ok: true, stored: false };

      const now = Date.now();
      this.idempotencyRecords.set(recordKey, {
        ...existing,
        status: 'failed',
        failure: {
          reasonCode: normalizeString(failure.reasonCode) || 'provisioning_failed',
          message: normalizeString(failure.message) || null
        },
        updatedAt: now,
        failedAt: now,
        expiresAt: now + this.settings.idempotencyTtlMs
      });

      return { ok: true, stored: true };
    },

    assertGrant(grant, requestedProtocols) {
      if (!this.settings.accountProvisioningEnabled) {
        return this.deny('feature_disabled', 'Account provisioning is disabled for this provider profile', false, 403);
      }

      const normalizedProtocols = this.normalizeRequestedProtocols(requestedProtocols || {});
      if (normalizedProtocols.atproto && !this.settings.atprotoEnabled) {
        return this.deny('protocol_disabled', 'ATProto provisioning is disabled by provider policy', false, 403);
      }

      if (
        !grant ||
        grant.capabilityId !== ACCOUNT_PROVISIONING_CAPABILITY ||
        grant.allowed !== true ||
        grant.approvedApp !== true
      ) {
        return this.deny('unauthorized_app', 'Account provisioning requires an approved application grant', false, 403);
      }

      if (grant.verifiedUser !== true) {
        return this.deny('user_verification_required', 'Account provisioning requires user verification', true, 403);
      }

      if (!this.isGrantFresh(grant)) {
        return this.deny('unauthorized_app', 'Account provisioning grant expired', true, 403);
      }

      if (normalizedProtocols.atproto && grant.requestedProtocols?.atproto !== true) {
        return this.deny('protocol_disabled', 'Provisioning grant did not authorize ATProto provisioning', false, 403);
      }

      return {
        allowed: true,
        capabilityId: ACCOUNT_PROVISIONING_CAPABILITY,
        providerProfile: this.getProviderProfile()
      };
    },

    normalizeRequestedProtocols(protocols) {
      return {
        solid: protocols.solid !== false,
        activitypub: protocols.activitypub !== false,
        atproto: protocols.atproto === true || protocols.atproto?.enabled === true
      };
    },

    findApprovedApp(appClientId) {
      if (!appClientId) return null;
      const apps = Array.isArray(this.settings.approvedApps) ? this.settings.approvedApps : [];
      return apps.find(app => app.clientId === appClientId) || null;
    },

    verifyAppAuthorization(app, authorization) {
      if (app.allowUnsigned === true && this.settings.requireBearerToken !== true) return true;

      const token = this.parseBearerToken(authorization);
      if (!token) return false;

      return app.bearerTokens.some(expected => timingSafeEquals(expected, token));
    },

    verifyUser(input, app) {
      if (!this.settings.requiresUserVerification) return true;

      const verification = input.verification || {};
      const challengeToken = normalizeString(verification.challengeToken || verification.token);

      if (this.settings.allowTrustedVerification && verification.verified === true) {
        return true;
      }

      if (challengeToken) {
        const configuredTokens = [
          ...(Array.isArray(this.settings.verificationTokens) ? this.settings.verificationTokens : []),
          ...(Array.isArray(app?.verificationTokens) ? app.verificationTokens : [])
        ];

        if (configuredTokens.some(expected => timingSafeEquals(expected, challengeToken))) {
          return true;
        }

        if (this.verifySignedVerificationToken(challengeToken, input)) {
          return true;
        }
      }

      return false;
    },

    verifySignedVerificationToken(token, input) {
      if (!this.settings.verificationSecret) return false;

      const [payloadSegment, signatureSegment] = String(token).split('.');
      if (!payloadSegment || !signatureSegment) return false;

      const expected = crypto
        .createHmac('sha256', this.settings.verificationSecret)
        .update(payloadSegment)
        .digest('base64url');

      if (!timingSafeEquals(expected, signatureSegment)) return false;

      let payload;
      try {
        payload = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8'));
      } catch (_error) {
        return false;
      }

      const expiresAt = Number(payload.expiresAt || payload.exp || 0);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

      if (payload.appClientId && payload.appClientId !== normalizeString(input.appClientId)) return false;
      if (payload.username && payload.username !== normalizeString(input.username)) return false;
      if (payload.email && payload.email !== normalizeString(input.email)) return false;

      const method = normalizeString(input.verification?.method);
      if (payload.method && method && payload.method !== method) return false;

      return true;
    },

    parseBearerToken(authorization) {
      const header = normalizeString(authorization);
      if (!header) return '';
      const [scheme, token] = header.split(' ');
      if (scheme !== 'Bearer' || !token) return '';
      return token.trim();
    },

    matchesAllowedValue(allowedValues, value) {
      if (!Array.isArray(allowedValues) || allowedValues.length === 0) return true;
      const normalized = normalizeString(value);
      if (!normalized) return true;
      return allowedValues.includes(normalized);
    },

    isGrantFresh(grant) {
      if (!this.settings.grantTtlMs) return true;
      const issuedAt = Date.parse(grant.issuedAt || '');
      if (!Number.isFinite(issuedAt)) return false;
      return Date.now() - issuedAt <= this.settings.grantTtlMs;
    },

    fingerprintProvisioningRequest(input) {
      return crypto
        .createHash('sha256')
        .update(JSON.stringify({
          appClientId: normalizeString(input.appClientId),
          username: normalizeString(input.username),
          email: normalizeString(input.email),
          requestedProtocols: this.normalizeRequestedProtocols(input.requestedProtocols || {})
        }))
        .digest('hex');
    },

    buildIdempotencyRecordKey(appClientId, idempotencyKey) {
      const scopedKey = `${appClientId}\n${idempotencyKey}`;
      return crypto.createHash('sha256').update(scopedKey).digest('hex');
    },

    resolveDailyLimit(app) {
      if (Number.isFinite(Number(app?.maxAccountsPerDay))) {
        return Math.max(1, Number(app.maxAccountsPerDay));
      }
      return Math.max(1, Number(this.settings.maxAccountsPerAppPerDay) || 1);
    },

    reserveDailyUsage(appClientId, limit) {
      const day = new Date().toISOString().slice(0, 10);
      const key = `${appClientId}:${day}`;
      const current = this.dailyUsage.get(key) || 0;
      if (current >= limit) {
        return { allowed: false, day, count: current, limit };
      }

      this.dailyUsage.set(key, current + 1);
      return { allowed: true, day, count: current + 1, limit };
    },

    pruneIdempotencyRecords() {
      const now = Date.now();
      for (const [key, record] of this.idempotencyRecords.entries()) {
        if (record.expiresAt <= now) {
          this.idempotencyRecords.delete(key);
        }
      }
    },

    enforceIdempotencyMaxEntries() {
      const maxEntries = this.settings.idempotencyMaxEntries;
      if (this.idempotencyRecords.size <= maxEntries) return;

      const entries = [...this.idempotencyRecords.entries()]
        .sort((a, b) => (a[1].updatedAt || a[1].createdAt || 0) - (b[1].updatedAt || b[1].createdAt || 0));

      for (const [key] of entries.slice(0, this.idempotencyRecords.size - maxEntries)) {
        this.idempotencyRecords.delete(key);
      }
    },

    deny(reasonCode, message, retryable, statusCode) {
      return {
        allowed: false,
        capabilityId: ACCOUNT_PROVISIONING_CAPABILITY,
        providerProfile: this.getProviderProfile(),
        reasonCode,
        message,
        retryable,
        statusCode
      };
    },

    throwDenied(result) {
      throw new MoleculerError(result.message, result.statusCode || 403, result.reasonCode || 'feature_disabled', {
        capabilityId: result.capabilityId,
        providerProfile: result.providerProfile,
        reasonCode: result.reasonCode,
        retryable: result.retryable === true
      });
    }
  }
};
