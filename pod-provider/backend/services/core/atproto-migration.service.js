const Redis = require('ioredis');
const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;

const MIGRATION_STATES = [
  'none',
  'pending',
  'service_auth_ready',
  'managed_account_created',
  'repo_imported',
  'blobs_migrated',
  'preferences_migrated',
  'identity_updated',
  'activated',
  'completed',
  'failed',
  'rolled_back'
];

const TERMINAL_STATES = new Set(['completed', 'failed', 'rolled_back']);

function nowIso() {
  return new Date().toISOString();
}

function sanitizeErrorMessage(message) {
  return String(message || 'ATProto migration failed')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer [redacted]')
    .replace(/[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, '[redacted-jwt]');
}

module.exports = {
  name: 'atproto-migration',

  dependencies: [
    'identitybindings',
    'atproto-service-auth',
    'atproto-repo-transfer',
    'atproto-blob-transfer',
    'atproto-preferences-transfer',
    'atproto-identity-transfer'
  ],

  settings: {
    redisUrl: process.env.SEMAPPS_REDIS_CACHE_URL || 'redis://localhost:6379',
    statePrefix: 'atproto:migration:state',
    secretPrefix: 'atproto:migration:secret',
    stateTtlSec: Math.max(900, Math.min(Number(process.env.ATPROTO_MIGRATION_STATE_TTL_SECONDS) || 172800, 1209600)),
    secretTtlSec: Math.max(300, Math.min(Number(process.env.ATPROTO_MIGRATION_SECRET_TTL_SECONDS) || 1800, 86400)),
    encKeyHex: process.env.ATPROTO_MIGRATION_SECRET_ENC_KEY_HEX || process.env.OAUTH_REFRESH_TOKEN_ENC_KEY_HEX || '',
    managedPdsUrl: process.env.ATPROTO_MANAGED_PDS_URL || process.env.ATPROTO_PDS_URL || '',
    requiredBlobCompletionRatio: Math.max(0, Math.min(Number(process.env.ATPROTO_MIGRATION_REQUIRED_BLOB_COMPLETION_RATIO) || 1, 1)),
    allowHttpLocalhost:
      process.env.ATPROTO_MIGRATION_ALLOW_HTTP_LOCALHOST === 'true' || process.env.NODE_ENV !== 'production'
  },

  created() {
    this.redis = new Redis(this.settings.redisUrl);
    if (this.settings.encKeyHex && !/^[0-9a-fA-F]{64}$/.test(this.settings.encKeyHex)) {
      throw new Error('ATPROTO_MIGRATION_SECRET_ENC_KEY_HEX must be 64 hex chars');
    }
    if (this.settings.encKeyHex) {
      this.encKey = Buffer.from(this.settings.encKeyHex, 'hex');
      return;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('ATPROTO_MIGRATION_SECRET_ENC_KEY_HEX is required in production');
    }

    this.encKey = crypto.randomBytes(32);
    this.logger.warn('[AtprotoMigration] Using ephemeral in-memory encryption key for migration secrets');
  },

  async stopped() {
    if (this.redis) {
      await this.redis.quit().catch(() => this.redis.disconnect());
    }
  },

  actions: {
    startMigration: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 },
        dryRun: { type: 'boolean', optional: true, default: false },
        migrateBlobs: { type: 'boolean', optional: true, default: true },
        migratePreferences: { type: 'boolean', optional: true, default: true },
        oldPdsUrl: { type: 'string', optional: true },
        newPdsUrl: { type: 'string', optional: true },
        sourceAccessToken: { type: 'string', optional: true },
        initiatedBy: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const canonicalAccountId = String(ctx.params.canonicalAccountId).trim();
        const correlationId = this.requireCorrelationId(ctx);
        const initiatedBy = String(ctx.params.initiatedBy || '').trim() || null;

        const binding = await ctx.call('identitybindings.getByCanonicalAccountId', {
          canonicalAccountId
        });
        this.assertMigrationAllowed(binding);

        const state = await this.getOrCreateState({
          canonicalAccountId,
          binding,
          dryRun: Boolean(ctx.params.dryRun),
          oldPdsUrl: ctx.params.oldPdsUrl,
          newPdsUrl: ctx.params.newPdsUrl,
          initiatedBy
        });

        if (state.migrationState === 'completed') {
          return this.statusResponse(state, correlationId, { alreadyCompleted: true });
        }

        try {
          const nextState = await this.executeMigration(ctx, {
            state,
            binding,
            dryRun: Boolean(ctx.params.dryRun),
            migrateBlobs: Boolean(ctx.params.migrateBlobs),
            migratePreferences: Boolean(ctx.params.migratePreferences),
            sourceAccessToken: ctx.params.sourceAccessToken || undefined,
            correlationId
          });

          return this.statusResponse(nextState, correlationId);
        } catch (error) {
          const failedState = await this.markFailed(state, error, correlationId);
          throw this.wrapError(error, correlationId, failedState.migrationState);
        }
      }
    },

    resumeMigration: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 },
        sourceAccessToken: { type: 'string', optional: true },
        migrateBlobs: { type: 'boolean', optional: true, default: true },
        migratePreferences: { type: 'boolean', optional: true, default: true }
      },
      async handler(ctx) {
        const canonicalAccountId = String(ctx.params.canonicalAccountId).trim();
        const correlationId = this.requireCorrelationId(ctx);

        const state = await this.getState(canonicalAccountId);
        if (!state) {
          throw new MoleculerError('Migration state not found', 404, 'ATPROTO_MIGRATION_VERIFICATION_FAILED');
        }
        if (state.migrationState === 'completed') {
          return this.statusResponse(state, correlationId, { alreadyCompleted: true });
        }

        const binding = await ctx.call('identitybindings.getByCanonicalAccountId', {
          canonicalAccountId
        });
        this.assertMigrationAllowed(binding);

        try {
          const nextState = await this.executeMigration(ctx, {
            state,
            binding,
            dryRun: Boolean(state.migrationDryRun),
            migrateBlobs: Boolean(ctx.params.migrateBlobs),
            migratePreferences: Boolean(ctx.params.migratePreferences),
            sourceAccessToken: ctx.params.sourceAccessToken || undefined,
            correlationId
          });
          return this.statusResponse(nextState, correlationId);
        } catch (error) {
          const failedState = await this.markFailed(state, error, correlationId);
          throw this.wrapError(error, correlationId, failedState.migrationState);
        }
      }
    },

    confirmMigration: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const canonicalAccountId = String(ctx.params.canonicalAccountId).trim();
        const correlationId = this.requireCorrelationId(ctx);
        const state = await this.getState(canonicalAccountId);

        if (!state) {
          throw new MoleculerError('Migration state not found', 404, 'ATPROTO_MIGRATION_VERIFICATION_FAILED');
        }

        state.confirmedAt = nowIso();
        state.confirmedBy = String(ctx.meta?.initiatedBy || '').trim() || null;
        await this.setState(canonicalAccountId, state);

        return this.statusResponse(state, correlationId, { confirmed: true });
      }
    },

    rollbackMigration: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const canonicalAccountId = String(ctx.params.canonicalAccountId).trim();
        const correlationId = this.requireCorrelationId(ctx);
        const state = await this.getState(canonicalAccountId);

        if (!state) {
          throw new MoleculerError('Migration state not found', 404, 'ATPROTO_MIGRATION_VERIFICATION_FAILED');
        }

        const secrets = await this.getSecretBundle(state.secretRef);

        if (secrets?.targetAccessToken && state.migrationNewPdsUrl) {
          await ctx.call('atproto-identity-transfer.deactivateAccount', {
            pdsUrl: state.migrationNewPdsUrl,
            accessToken: secrets.targetAccessToken
          }).catch(() => {});
        }

        state.migrationState = 'rolled_back';
        state.migrationLastErrorCode = null;
        state.migrationLastErrorAt = null;
        state.migrationCompletedAt = nowIso();
        await this.deleteSecretBundle(state.secretRef);
        state.secretRef = null;
        state.updatedAt = nowIso();
        await this.setState(canonicalAccountId, state);

        return this.statusResponse(state, correlationId, { rolledBack: true });
      }
    },

    getMigrationStatus: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const canonicalAccountId = String(ctx.params.canonicalAccountId).trim();
        const correlationId = this.requireCorrelationId(ctx);
        const state = await this.getState(canonicalAccountId);

        if (!state) {
          return {
            canonicalAccountId,
            migrationState: 'none',
            correlationId
          };
        }

        return this.statusResponse(state, correlationId);
      }
    }
  },

  methods: {
    async executeMigration(ctx, args) {
      const {
        state,
        binding,
        dryRun,
        migrateBlobs,
        migratePreferences,
        sourceAccessToken,
        correlationId
      } = args;

      const canonicalAccountId = state.canonicalAccountId;
      const oldPdsUrl = this.normalizePdsUrl(state.migrationOldPdsUrl || binding.atprotoPdsUrl);
      const newPdsUrl = this.normalizePdsUrl(state.migrationNewPdsUrl || this.settings.managedPdsUrl);
      this.assertManagedPdsConfigured(newPdsUrl);
      state.migrationOldPdsUrl = oldPdsUrl;
      state.migrationNewPdsUrl = newPdsUrl;

      const secretRef = state.secretRef || crypto.randomUUID();
      state.secretRef = secretRef;
      let secrets = (await this.getSecretBundle(secretRef)) || {};

      if (sourceAccessToken) {
        secrets.sourceAccessToken = String(sourceAccessToken);
        await this.setSecretBundle(secretRef, secrets);
      }

      if (!secrets.sourceAccessToken) {
        throw new MoleculerError(
          'Missing source access token for external account migration',
          400,
          'ATPROTO_MIGRATION_SERVICE_AUTH_FAILED'
        );
      }

      await this.updateState(canonicalAccountId, state, 'pending');

      if (dryRun) {
        await ctx.call('atproto-service-auth.getServiceAuth', {
          oldPdsUrl,
          sessionAccessToken: secrets.sourceAccessToken,
          aud: newPdsUrl,
          did: binding.atprotoDid
        });

        await this.deleteSecretBundle(secretRef);
        state.secretRef = null;
        state.migrationState = 'completed';
        state.migrationCompletedAt = nowIso();
        state.updatedAt = nowIso();
        await this.setState(canonicalAccountId, state);

        this.audit('migration.dry_run.completed', {
          correlationId,
          canonicalAccountId,
          did: binding.atprotoDid,
          oldPdsUrl,
          newPdsUrl,
          initiatedBy: state.initiatedBy || null
        });

        return state;
      }

      if (!this.hasReachedState(state, 'service_auth_ready')) {
        const serviceAuth = await ctx.call('atproto-service-auth.getServiceAuth', {
          oldPdsUrl,
          sessionAccessToken: secrets.sourceAccessToken,
          aud: newPdsUrl,
          did: binding.atprotoDid
        });
        secrets.serviceAuth = serviceAuth.token;
        await this.setSecretBundle(secretRef, secrets);
        await this.updateState(canonicalAccountId, state, 'service_auth_ready');
      }

      if (!this.hasReachedState(state, 'managed_account_created')) {
        const managedAccount = await ctx.call('atproto-repo-transfer.createManagedHostingForExistingDid', {
          canonicalAccountId,
          did: binding.atprotoDid,
          handle: binding.atprotoHandle,
          newPdsUrl,
          serviceAuth: secrets.serviceAuth
        });

        secrets.targetAccessToken = managedAccount.accessJwt;
        if (managedAccount.refreshJwt) {
          secrets.targetRefreshToken = managedAccount.refreshJwt;
        }
        await this.setSecretBundle(secretRef, secrets);
        await this.updateState(canonicalAccountId, state, 'managed_account_created');
      }

      if (!this.hasReachedState(state, 'repo_imported')) {
        const repoCar = await ctx.call('atproto-repo-transfer.fetchRepoCar', {
          oldPdsUrl,
          did: binding.atprotoDid,
          accessToken: secrets.sourceAccessToken
        });

        try {
          await ctx.call('atproto-repo-transfer.importRepoCar', {
            newPdsUrl,
            did: binding.atprotoDid,
            accessToken: secrets.targetAccessToken,
            spoolPath: repoCar.spoolPath,
            expectedSha256: repoCar.sha256,
            expectedBytes: repoCar.bytes
          });

          await ctx.call('atproto-repo-transfer.verifyImportedRepo', {
            newPdsUrl,
            did: binding.atprotoDid,
            accessToken: secrets.targetAccessToken
          });
        } finally {
          await ctx.call('atproto-repo-transfer.cleanupTempCar', {
            spoolPath: repoCar.spoolPath
          }).catch(() => {});
        }

        await this.updateState(canonicalAccountId, state, 'repo_imported');
      }

      if (migrateBlobs && !this.hasReachedState(state, 'blobs_migrated')) {
        const blobResult = await ctx.call('atproto-blob-transfer.transferMissingBlobs', {
          oldPdsUrl,
          newPdsUrl,
          did: binding.atprotoDid,
          sourceAccessToken: secrets.sourceAccessToken,
          targetAccessToken: secrets.targetAccessToken,
          requiredCompletionRatio: this.settings.requiredBlobCompletionRatio
        });

        state.blobTransfer = {
          copiedCount: blobResult.copiedCount,
          missingCount: blobResult.missingCount,
          sourceCount: blobResult.sourceCount,
          failedCids: blobResult.failedCids
        };

        if (!blobResult.completionMet) {
          throw new MoleculerError(
            'Required blob transfer completion threshold not met',
            409,
            'ATPROTO_MIGRATION_BLOB_TRANSFER_FAILED'
          );
        }

        await this.updateState(canonicalAccountId, state, 'blobs_migrated');
      }

      if (!migrateBlobs && !this.hasReachedState(state, 'blobs_migrated')) {
        state.blobTransfer = {
          copiedCount: 0,
          missingCount: 0,
          sourceCount: 0,
          failedCids: []
        };
        await this.updateState(canonicalAccountId, state, 'blobs_migrated');
      }

      if (migratePreferences && !this.hasReachedState(state, 'preferences_migrated')) {
        try {
          const exported = await ctx.call('atproto-preferences-transfer.exportPreferences', {
            oldPdsUrl,
            accessToken: secrets.sourceAccessToken
          });
          await ctx.call('atproto-preferences-transfer.importPreferences', {
            newPdsUrl,
            accessToken: secrets.targetAccessToken,
            preferences: exported.preferences
          });
          state.preferencesTransfer = {
            migrated: true,
            count: Array.isArray(exported.preferences) ? exported.preferences.length : 0,
            warning: null
          };
        } catch (error) {
          state.preferencesTransfer = {
            migrated: false,
            count: 0,
            warning: sanitizeErrorMessage(error?.message || 'preferences migration warning')
          };
        }
        await this.updateState(canonicalAccountId, state, 'preferences_migrated');
      }

      if (!migratePreferences && !this.hasReachedState(state, 'preferences_migrated')) {
        state.preferencesTransfer = {
          migrated: false,
          count: 0,
          warning: 'preferences migration skipped by caller'
        };
        await this.updateState(canonicalAccountId, state, 'preferences_migrated');
      }

      if (!state.confirmedAt) {
        state.migrationLastErrorCode = 'ATPROTO_MIGRATION_REQUIRES_CONFIRMATION';
        state.migrationLastErrorAt = nowIso();
        state.updatedAt = nowIso();
        await this.setState(canonicalAccountId, state);
        return state;
      }

      if (!this.hasReachedState(state, 'identity_updated')) {
        const did = binding.atprotoDid;

        if (did.startsWith('did:web:')) {
          await ctx.call('atproto-identity-transfer.verifyIdentityNowPointsToNewPds', {
            did,
            expectedPdsUrl: newPdsUrl
          });
        } else {
          const credentials = await ctx.call('atproto-identity-transfer.getRecommendedDidCredentials', {
            newPdsUrl,
            accessToken: secrets.targetAccessToken
          });

          const signature = await ctx.call('atproto-identity-transfer.requestPlcOperationSignature', {
            oldPdsUrl,
            accessToken: secrets.sourceAccessToken
          });

          const signedOperation = await ctx.call('atproto-identity-transfer.signPlcOperation', {
            oldPdsUrl,
            accessToken: secrets.sourceAccessToken,
            token: String(signature.token || ''),
            requestedDidCredentials: credentials
          });

          await ctx.call('atproto-identity-transfer.submitPlcOperation', {
            newPdsUrl,
            accessToken: secrets.targetAccessToken,
            signedOperation
          });

          await ctx.call('atproto-identity-transfer.verifyIdentityNowPointsToNewPds', {
            did,
            expectedPdsUrl: newPdsUrl
          });
        }

        await this.updateState(canonicalAccountId, state, 'identity_updated');
      }

      if (!this.hasReachedState(state, 'activated')) {
        await ctx.call('atproto-identity-transfer.activateAccount', {
          pdsUrl: newPdsUrl,
          accessToken: secrets.targetAccessToken
        });

        await ctx.call('atproto-identity-transfer.deactivateAccount', {
          pdsUrl: oldPdsUrl,
          accessToken: secrets.sourceAccessToken
        });

        await this.updateState(canonicalAccountId, state, 'activated');
      }

      await ctx.call('identitybindings.upsert', {
        canonicalAccountId: binding.canonicalAccountId,
        webId: binding.webId,
        activityPubActorId: binding.activityPubActorId,
        activityPubHandle: binding.activityPubHandle,
        atprotoDid: binding.atprotoDid,
        atprotoHandle: binding.atprotoHandle,
        atprotoSource: 'local',
        atprotoManaged: true,
        atprotoPdsUrl: newPdsUrl,
        atSigningKeyRef: binding.atSigningKeyRef,
        atRotationKeyRef: binding.atRotationKeyRef,
        status: binding.status || 'active',
        repoInitialized: true,
        repoRootCid: binding.repoRootCid || null,
        repoRev: binding.repoRev || null
      });

      state.migrationState = 'completed';
      state.migrationCompletedAt = nowIso();
      state.migrationLastErrorCode = null;
      state.migrationLastErrorAt = null;
      state.updatedAt = nowIso();
      await this.setState(canonicalAccountId, state);

      await this.deleteSecretBundle(secretRef);
      state.secretRef = null;

      this.audit('migration.completed', {
        correlationId,
        canonicalAccountId,
        did: binding.atprotoDid,
        oldPdsUrl,
        newPdsUrl,
        initiatedBy: state.initiatedBy || null
      });

      return state;
    },

    assertMigrationAllowed(binding) {
      if (!binding) {
        throw new MoleculerError('Identity binding not found', 404, 'ATPROTO_MIGRATION_NOT_EXTERNAL');
      }
      if (binding.atprotoSource !== 'external' || binding.atprotoManaged !== false) {
        throw new MoleculerError(
          'ATProto binding is not in external unmanaged mode',
          409,
          'ATPROTO_MIGRATION_NOT_EXTERNAL'
        );
      }
      if (!binding.atprotoDid || !binding.atprotoHandle || !binding.atprotoPdsUrl) {
        throw new MoleculerError(
          'ATProto binding is missing required DID/handle/PDS fields',
          409,
          'ATPROTO_MIGRATION_VERIFICATION_FAILED'
        );
      }
    },

    assertManagedPdsConfigured(newPdsUrl) {
      if (!newPdsUrl) {
        throw new MoleculerError(
          'Managed PDS URL is not configured',
          500,
          'ATPROTO_MIGRATION_VERIFICATION_FAILED'
        );
      }
    },

    statusResponse(state, correlationId, extra = {}) {
      return {
        canonicalAccountId: state.canonicalAccountId,
        migrationState: state.migrationState,
        migrationOldPdsUrl: state.migrationOldPdsUrl,
        migrationNewPdsUrl: state.migrationNewPdsUrl,
        migrationStartedAt: state.migrationStartedAt,
        migrationCompletedAt: state.migrationCompletedAt,
        migrationLastErrorCode: state.migrationLastErrorCode,
        migrationLastErrorAt: state.migrationLastErrorAt,
        migrationDryRun: Boolean(state.migrationDryRun),
        requiresConfirmation: state.migrationLastErrorCode === 'ATPROTO_MIGRATION_REQUIRES_CONFIRMATION' && !state.confirmedAt,
        confirmedAt: state.confirmedAt || null,
        blobTransfer: state.blobTransfer || null,
        preferencesTransfer: state.preferencesTransfer || null,
        correlationId,
        ...extra
      };
    },

    hasReachedState(state, targetState) {
      const currentIndex = MIGRATION_STATES.indexOf(state.migrationState);
      const targetIndex = MIGRATION_STATES.indexOf(targetState);
      return currentIndex >= targetIndex;
    },

    async updateState(canonicalAccountId, state, migrationState) {
      if (!MIGRATION_STATES.includes(migrationState)) {
        throw new Error(`Invalid migration state: ${migrationState}`);
      }
      state.migrationState = migrationState;
      state.migrationLastErrorCode = null;
      state.migrationLastErrorAt = null;
      state.updatedAt = nowIso();
      await this.setState(canonicalAccountId, state);
      return state;
    },

    async markFailed(state, error, correlationId) {
      state.migrationState = 'failed';
      state.migrationLastErrorCode = String(error?.type || error?.code || 'ATPROTO_MIGRATION_VERIFICATION_FAILED');
      state.migrationLastErrorAt = nowIso();
      state.updatedAt = nowIso();
      await this.setState(state.canonicalAccountId, state);

      this.audit('migration.failed', {
        correlationId,
        canonicalAccountId: state.canonicalAccountId,
        did: state.did || null,
        oldPdsUrl: state.migrationOldPdsUrl,
        newPdsUrl: state.migrationNewPdsUrl,
        failureCode: state.migrationLastErrorCode,
        initiatedBy: state.initiatedBy || null
      });

      return state;
    },

    wrapError(error, correlationId, migrationState) {
      if (error instanceof MoleculerError) {
        return new MoleculerError(
          sanitizeErrorMessage(error.message),
          Number(error.code) || 500,
          String(error.type || 'ATPROTO_MIGRATION_VERIFICATION_FAILED'),
          {
            correlationId,
            migrationState
          }
        );
      }
      return new MoleculerError(
        sanitizeErrorMessage(error?.message || 'ATProto migration failed'),
        500,
        'ATPROTO_MIGRATION_VERIFICATION_FAILED',
        {
          correlationId,
          migrationState
        }
      );
    },

    async getOrCreateState({ canonicalAccountId, binding, dryRun, oldPdsUrl, newPdsUrl, initiatedBy }) {
      const existing = await this.getState(canonicalAccountId);
      if (existing && !TERMINAL_STATES.has(existing.migrationState)) {
        return existing;
      }

      const state = {
        canonicalAccountId,
        did: binding.atprotoDid,
        migrationState: 'none',
        migrationOldPdsUrl: this.normalizePdsUrl(oldPdsUrl || binding.atprotoPdsUrl),
        migrationNewPdsUrl: this.normalizePdsUrl(newPdsUrl || this.settings.managedPdsUrl),
        migrationStartedAt: nowIso(),
        migrationCompletedAt: null,
        migrationLastErrorCode: null,
        migrationLastErrorAt: null,
        migrationDryRun: Boolean(dryRun),
        initiatedBy: initiatedBy || null,
        confirmedAt: null,
        confirmedBy: null,
        blobTransfer: null,
        preferencesTransfer: null,
        secretRef: crypto.randomUUID(),
        createdAt: nowIso(),
        updatedAt: nowIso()
      };

      await this.setState(canonicalAccountId, state);
      return state;
    },

    async getState(canonicalAccountId) {
      const key = `${this.settings.statePrefix}:${this.hashCanonicalAccountId(canonicalAccountId)}`;
      const raw = await this.redis.get(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch {
        return null;
      }
    },

    async setState(canonicalAccountId, state) {
      const key = `${this.settings.statePrefix}:${this.hashCanonicalAccountId(canonicalAccountId)}`;
      await this.redis.set(key, JSON.stringify(state), 'EX', this.settings.stateTtlSec);
    },

    async setSecretBundle(secretRef, secretPayload) {
      const key = `${this.settings.secretPrefix}:${secretRef}`;
      await this.redis.set(key, this.encrypt(secretPayload), 'EX', this.settings.secretTtlSec);
    },

    async getSecretBundle(secretRef) {
      if (!secretRef) return null;
      const key = `${this.settings.secretPrefix}:${secretRef}`;
      const raw = await this.redis.get(key);
      if (!raw) return null;
      try {
        return this.decrypt(raw);
      } catch {
        return null;
      }
    },

    async deleteSecretBundle(secretRef) {
      if (!secretRef) return;
      await this.redis.del(`${this.settings.secretPrefix}:${secretRef}`);
    },

    encrypt(payload) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', this.encKey, iv);
      const body = Buffer.from(JSON.stringify(payload), 'utf8');
      const ciphertext = Buffer.concat([cipher.update(body), cipher.final()]);
      const tag = cipher.getAuthTag();
      return JSON.stringify({
        iv: iv.toString('base64url'),
        tag: tag.toString('base64url'),
        ciphertext: ciphertext.toString('base64url')
      });
    },

    decrypt(value) {
      const parsed = JSON.parse(value);
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        this.encKey,
        Buffer.from(parsed.iv, 'base64url')
      );
      decipher.setAuthTag(Buffer.from(parsed.tag, 'base64url'));
      const clear = Buffer.concat([
        decipher.update(Buffer.from(parsed.ciphertext, 'base64url')),
        decipher.final()
      ]);
      return JSON.parse(clear.toString('utf8'));
    },

    hashCanonicalAccountId(canonicalAccountId) {
      return crypto.createHash('sha256').update(String(canonicalAccountId), 'utf8').digest('hex');
    },

    requireCorrelationId(ctx) {
      const headerValue =
        ctx?.meta?.$headers?.['x-request-id'] ||
        ctx?.meta?.$headers?.['X-Request-Id'] ||
        ctx?.meta?.correlationId;
      const value = String(headerValue || '').trim();
      const correlationId = value ? value.replace(/[^\w.-]/g, '').slice(0, 128) : crypto.randomUUID();
      ctx.meta.correlationId = correlationId;
      ctx.meta.$responseHeaders = {
        ...(ctx.meta.$responseHeaders || {}),
        'X-Request-Id': correlationId,
        'Cache-Control': 'no-store',
        Pragma: 'no-cache'
      };
      return correlationId;
    },

    normalizePdsUrl(rawUrl) {
      let parsed;
      try {
        parsed = new URL(String(rawUrl || '').trim());
      } catch (_error) {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_MIGRATION_VERIFICATION_FAILED');
      }

      if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_MIGRATION_VERIFICATION_FAILED');
      }

      if (parsed.pathname && parsed.pathname !== '/') {
        throw new MoleculerError('Invalid PDS URL', 400, 'ATPROTO_MIGRATION_VERIFICATION_FAILED');
      }

      const isLocalhost =
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1';

      const allowedScheme =
        parsed.protocol === 'https:' ||
        (this.settings.allowHttpLocalhost && isLocalhost && parsed.protocol === 'http:');

      if (!allowedScheme) {
        throw new MoleculerError('PDS URL must use HTTPS', 400, 'ATPROTO_MIGRATION_VERIFICATION_FAILED');
      }

      return parsed.origin;
    },

    audit(event, payload) {
      this.logger.info(`[AtprotoMigration] ${event}`, {
        event,
        at: nowIso(),
        ...payload
      });
    }
  }
};