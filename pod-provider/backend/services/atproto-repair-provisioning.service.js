const { MoleculerError } = require('moleculer').Errors;

module.exports = {
  name: 'atproto-repair-provisioning',

  dependencies: ['identitybindings', 'signing'],

  settings: {
    internalBearerToken:
      process.env.ACTIVITYPODS_TOKEN ||
      process.env.INTERNAL_API_TOKEN ||
      process.env.SIDECAR_TOKEN ||
      '',
    repoBootstrapRootCid:
      process.env.ATPROTO_REPO_BOOTSTRAP_ROOT_CID || 'bafyreigenesisplaceholder',
    repoBootstrapRev:
      process.env.ATPROTO_REPO_BOOTSTRAP_REV || '0',
    maxRetryAttempts: Math.max(
      1,
      Math.min(Number(process.env.ATPROTO_REPAIR_MAX_RETRIES) || 3, 5)
    ),
    baseRetryDelayMs: Math.max(
      100,
      Math.min(Number(process.env.ATPROTO_REPAIR_BASE_DELAY_MS) || 250, 2_000)
    )
  },

  actions: {
    repairProvisionedAccount: {
      params: {
        canonicalAccountId: 'string|min:1',
        dryRun: { type: 'boolean', optional: true, default: false },
        force: { type: 'boolean', optional: true, default: false }
      },
      async handler(ctx) {
        const canonicalAccountId = String(ctx.params.canonicalAccountId).trim();
        const binding = await ctx.call('identitybindings.getByCanonicalAccountId', {
          canonicalAccountId
        });

        if (!binding) {
          throw new MoleculerError(
            'Identity binding not found',
            404,
            'IDENTITY_BINDING_NOT_FOUND'
          );
        }

        return this.repairBinding(ctx, binding, {
          dryRun: Boolean(ctx.params.dryRun),
          force: Boolean(ctx.params.force)
        });
      }
    },

    backfillLegacyRepoBootstrap: {
      params: {
        since: { type: 'string', optional: true },
        limit: { type: 'number', integer: true, positive: true, optional: true, convert: true },
        dryRun: { type: 'boolean', optional: true, default: true },
        force: { type: 'boolean', optional: true, default: false }
      },
      async handler(ctx) {
        const limit = Math.max(1, Math.min(Number(ctx.params.limit) || 100, 500));
        const result = await ctx.call('identitybindings.list', {
          since: ctx.params.since || null,
          limit
        });

        const items = Array.isArray(result?.items) ? result.items : [];
        const report = [];
        let repairable = 0;
        let repaired = 0;
        let failed = 0;

        for (const binding of items) {
          if (!this.hasRepairableAtprotoIdentity(binding)) {
            report.push(this.buildRepairResult(binding, {
              dryRun: Boolean(ctx.params.dryRun),
              repaired: false,
              status: 'skipped_not_repairable'
            }));
            continue;
          }

          if (!this.needsRepoBootstrapRepair(binding) && !ctx.params.force) {
            report.push(this.buildRepairResult(binding, {
              dryRun: Boolean(ctx.params.dryRun),
              repaired: false,
              status: 'already_valid'
            }));
            continue;
          }

          repairable += 1;
          try {
            const repairedBinding = await this.repairBinding(ctx, binding, {
              dryRun: Boolean(ctx.params.dryRun),
              force: Boolean(ctx.params.force)
            });
            if (repairedBinding.repaired) {
              repaired += 1;
            }
            report.push(repairedBinding);
          } catch (error) {
            failed += 1;
            this.logger.warn('[AtprotoRepair] failed to repair legacy binding', {
              canonicalAccountId: binding?.canonicalAccountId || null,
              code: error?.code,
              type: error?.type,
              message: error?.message
            });
            report.push(
              this.buildRepairErrorResult(binding, {
                dryRun: Boolean(ctx.params.dryRun),
                status: 'failed',
                error
              })
            );
          }
        }

        return {
          dryRun: Boolean(ctx.params.dryRun),
          examined: items.length,
          repairable,
          repaired,
          failed,
          skipped: items.length - repairable,
          nextCursor:
            typeof result?.nextCursor === 'string' || result?.nextCursor === null
              ? result.nextCursor
              : ctx.params.since || null,
          items: report
        };
      }
    }
  },

  methods: {
    hasRepairableAtprotoIdentity(binding) {
      return Boolean(
        binding &&
          binding.canonicalAccountId &&
          binding.atprotoDid &&
          binding.atprotoHandle &&
          binding.atSigningKeyRef &&
          binding.atRotationKeyRef
      );
    },

    needsRepoBootstrapRepair(binding) {
      return !(
        binding &&
        binding.repoInitialized === true &&
        binding.repoRootCid &&
        binding.repoRev
      );
    },

    async repairBinding(ctx, binding, { dryRun, force }) {
      if (!this.hasRepairableAtprotoIdentity(binding)) {
        throw new MoleculerError(
          'Identity binding is not repairable because required ATProto fields are missing',
          400,
          'ATPROTO_BINDING_NOT_REPAIRABLE'
        );
      }

      const shouldRepair = force || this.needsRepoBootstrapRepair(binding);
      if (!shouldRepair) {
        return this.buildRepairResult(binding, {
          dryRun,
          repaired: false,
          status: 'already_valid'
        });
      }

      await this.verifySigningReadiness(ctx, binding.canonicalAccountId);

      const repoRootCid = binding.repoRootCid || this.settings.repoBootstrapRootCid;
      const repoRev = binding.repoRev || this.settings.repoBootstrapRev;

      if (dryRun) {
        return this.buildRepairResult(
          {
            ...binding,
            repoInitialized: true,
            repoRootCid,
            repoRev
          },
          {
            dryRun: true,
            repaired: false,
            status: 'would_repair'
          }
        );
      }

      await this.withRetry(
        'upsertRepoBootstrap',
        () =>
          ctx.call('identitybindings.upsertRepoBootstrap', {
            canonicalAccountId: binding.canonicalAccountId,
            did: binding.atprotoDid,
            handle: binding.atprotoHandle,
            repoInitialized: true,
            rootCid: repoRootCid,
            rev: repoRev
          })
      );

      const refreshed = await ctx.call('identitybindings.getByCanonicalAccountId', {
        canonicalAccountId: binding.canonicalAccountId
      });

      if (this.needsRepoBootstrapRepair(refreshed)) {
        throw new MoleculerError(
          'Repo bootstrap repair did not persist expected state',
          500,
          'ATPROTO_REPAIR_INCOMPLETE'
        );
      }

      return this.buildRepairResult(refreshed, {
        dryRun: false,
        repaired: true,
        status: 'repaired'
      });
    },

    async verifySigningReadiness(ctx, canonicalAccountId) {
      const signingCallOptions = this.getSigningCallOptions(ctx);

      await this.withRetry('signing.commit', () =>
        ctx.call(
          'signing.getAtprotoPublicKey',
          {
            canonicalAccountId,
            purpose: 'commit'
          },
          signingCallOptions
        )
      );

      await this.withRetry('signing.rotation', () =>
        ctx.call(
          'signing.getAtprotoPublicKey',
          {
            canonicalAccountId,
            purpose: 'rotation'
          },
          signingCallOptions
        )
      );
    },

    getSigningCallOptions(ctx) {
      const incomingAuthorization =
        ctx?.meta?.$headers?.authorization || ctx?.meta?.$headers?.Authorization;

      if (incomingAuthorization) {
        return {
          meta: {
            $headers: {
              authorization: incomingAuthorization
            }
          }
        };
      }

      if (!this.settings.internalBearerToken) {
        return {};
      }

      return {
        meta: {
          $headers: {
            authorization: `Bearer ${this.settings.internalBearerToken}`
          }
        }
      };
    },

    buildRepairResult(binding, { dryRun, repaired, status }) {
      return {
        canonicalAccountId: binding?.canonicalAccountId || null,
        atproto: {
          did: binding?.atprotoDid || null,
          handle: binding?.atprotoHandle || null
        },
        repo: {
          initialized: Boolean(binding?.repoInitialized),
          rootCid: binding?.repoRootCid || null,
          rev: binding?.repoRev || null
        },
        dryRun: Boolean(dryRun),
        repaired: Boolean(repaired),
        status
      };
    },

    buildRepairErrorResult(binding, { dryRun, status, error }) {
      return {
        ...this.buildRepairResult(binding, {
          dryRun,
          repaired: false,
          status
        }),
        error: {
          code:
            typeof error?.code === 'number' || typeof error?.code === 'string'
              ? error.code
              : 'UNKNOWN_ERROR',
          type: error?.type || 'UNKNOWN_ERROR',
          message: this.sanitizeErrorMessage(error?.message),
          retryable: this.isRetryableError(error)
        }
      };
    },

    sanitizeErrorMessage(message) {
      const normalized =
        typeof message === 'string' && message.trim().length > 0
          ? message.trim()
          : 'Repair failed';

      return normalized.replace(/-----BEGIN[\s\S]*?-----END [A-Z ]+-----/g, '[redacted-key-material]');
    },

    async withRetry(label, fn) {
      let lastError = null;

      for (let attempt = 1; attempt <= this.settings.maxRetryAttempts; attempt += 1) {
        try {
          return await fn();
        } catch (error) {
          lastError = error;
          if (!this.isRetryableError(error) || attempt === this.settings.maxRetryAttempts) {
            throw error;
          }

          const backoffMs = this.computeBackoffMs(attempt);
          this.logger.warn('[AtprotoRepair] transient failure, retrying', {
            label,
            attempt,
            backoffMs,
            error: error.message,
            code: error.code,
            type: error.type
          });
          await this.sleep(backoffMs);
        }
      }

      throw lastError || new Error(`Repair step failed: ${label}`);
    },

    isRetryableError(error) {
      if (!error || typeof error !== 'object') return false;
      const statusCode = Number(error.code);
      const type = String(error.type || '');
      const message = String(error.message || '');

      return (
        statusCode === 408 ||
        statusCode === 425 ||
        statusCode === 429 ||
        statusCode >= 500 ||
        type.includes('TIMEOUT') ||
        type === 'SERVICE_UNAVAILABLE' ||
        message.includes('timeout') ||
        message.includes('ECONNRESET') ||
        message.includes('EAI_AGAIN')
      );
    },

    computeBackoffMs(attempt) {
      const base = this.settings.baseRetryDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.floor(Math.random() * 200);
      return Math.min(base + jitter, 2_500);
    },

    sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }
};
