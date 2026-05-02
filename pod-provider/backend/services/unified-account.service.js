const { MoleculerError } = require('moleculer').Errors;

module.exports = {
  name: 'unified-account',

  settings: {
    defaults: {
      enableSolid: true,
      enableActivityPub: true,
      enableAtproto: true,
      atprotoDidMethod: 'plc'
    }
  },

  dependencies: [
    'provider-capabilities',
    'accounts',
    'webid-provisioning',
    'activitypub-provisioning',
    'atproto-provisioning',
    'account-provisioning-state'
  ],

  actions: {
    create: {
      params: {
        username: 'string|min:1',
        email: { type: 'string', optional: true },
        password: 'string|min:8',
        profile: {
          type: 'object',
          props: {
            displayName: 'string|min:1',
            summary: { type: 'string', optional: true }
          }
        },
        solid: {
          type: 'object',
          optional: true,
          props: {
            enabled: { type: 'boolean', optional: true }
          }
        },
        activitypub: {
          type: 'object',
          optional: true,
          props: {
            enabled: { type: 'boolean', optional: true }
          }
        },
        atproto: {
          type: 'object',
          optional: true,
          props: {
            enabled: { type: 'boolean', optional: true },
            requestedHandle: { type: 'string', optional: true },
            didMethod: { type: 'enum', values: ['plc', 'web'], optional: true },
            force: { type: 'boolean', optional: true }
          }
        }
      },
      async handler(ctx) {
        const input = ctx.params;
        const requestedProtocols = this.requestedProtocolsFromInput(input);

        await ctx.call('provider-capabilities.assertAccountProvisioningGrant', {
          grant: ctx.meta?.accountProvisioning || {},
          requestedProtocols
        });

        const enableSolid = requestedProtocols.solid;
        const enableActivityPub = requestedProtocols.activitypub;
        const enableAtproto = requestedProtocols.atproto;
        const atprotoDidMethod = input.atproto?.didMethod ?? this.settings.defaults.atprotoDidMethod;

        const warnings = [];
        const failedPhases = [];

        const provisioning = await ctx.call('account-provisioning-state.begin', {
          username: input.username
        });

        const provisioningId = provisioning.provisioningId;

        let canonical = null;
        let solid = null;
        let activitypub = null;
        let atproto = null;
        let currentPhase = 'canonical_account';

        try {
          currentPhase = 'canonical_account';
          await ctx.call('account-provisioning-state.markPhase', {
            provisioningId,
            phase: currentPhase,
            status: 'started'
          });

          canonical = await ctx.call('accounts.create', {
            username: input.username,
            email: input.email,
            password: input.password,
            profile: input.profile
          });

          await ctx.call('account-provisioning-state.markPhase', {
            provisioningId,
            phase: currentPhase,
            status: 'completed'
          });

          if (enableSolid) {
            currentPhase = 'webid';
            await ctx.call('account-provisioning-state.markPhase', {
              provisioningId,
              phase: currentPhase,
              status: 'started'
            });

            solid = await ctx.call('webid-provisioning.create', {
              canonicalAccountId: canonical.canonicalAccountId,
              username: input.username,
              profile: input.profile
            });

            await ctx.call('account-provisioning-state.markPhase', {
              provisioningId,
              phase: currentPhase,
              status: 'completed'
            });
          }

          if (!solid?.webId) {
            throw new MoleculerError('WebID provisioning did not return a webId', 500, 'WEBID_PROVISIONING_FAILED');
          }

          if (canonical.canonicalAccountId !== solid.webId) {
            warnings.push('canonicalAccountId and webId differ; current AT provisioning path expects them to match');
          }

          if (enableActivityPub) {
            currentPhase = 'activitypub';
            await ctx.call('account-provisioning-state.markPhase', {
              provisioningId,
              phase: currentPhase,
              status: 'started'
            });

            activitypub = await ctx.call('activitypub-provisioning.provisionForAccount', {
              canonicalAccountId: canonical.canonicalAccountId,
              webId: solid.webId,
              username: input.username,
              profile: input.profile
            });

            await ctx.call('account-provisioning-state.markPhase', {
              provisioningId,
              phase: currentPhase,
              status: 'completed'
            });
          }

          if (enableAtproto) {
            currentPhase = 'atproto';
            await ctx.call('account-provisioning-state.markPhase', {
              provisioningId,
              phase: currentPhase,
              status: 'started'
            });

            atproto = await ctx.call('atproto-provisioning.provisionForAccount', {
              canonicalAccountId: canonical.canonicalAccountId,
              webId: solid.webId,
              requestedHandle: input.atproto?.requestedHandle,
              didMethod: atprotoDidMethod,
              profile: input.profile,
              force: input.atproto?.force ?? false
            });

            if (!atproto?.did || !atproto?.repoInitialized) {
              throw new MoleculerError('ATProto provisioning incomplete', 500, 'ATPROTO_PROVISIONING_INCOMPLETE');
            }

            await ctx.call('account-provisioning-state.markPhase', {
              provisioningId,
              phase: currentPhase,
              status: 'completed'
            });
          }

          await ctx.call('account-provisioning-state.finalize', {
            provisioningId,
            state: 'completed'
          });

          return {
            canonicalAccountId: canonical.canonicalAccountId,
            webId: solid.webId,
            activitypub: activitypub
              ? {
                  actorId: activitypub.actorId,
                  handle: activitypub.handle,
                  inbox: activitypub.inbox,
                  outbox: activitypub.outbox
                }
              : null,
            atproto: atproto
              ? {
                  did: atproto.did,
                  handle: atproto.handle,
                  repoInitialized: !!atproto.repoInitialized,
                  signingReady: true
                }
              : null,
            solid: {
              webId: solid.webId,
              podBaseUrl: solid.podBaseUrl
            },
            provisioning: {
              state: 'completed',
              warnings: warnings.length > 0 ? warnings : undefined
            },
            createdAt: canonical.createdAt || new Date().toISOString()
          };
        } catch (e) {
          failedPhases.push(currentPhase);

          try {
            await ctx.call('account-provisioning-state.markPhase', {
              provisioningId,
              phase: currentPhase,
              status: 'failed',
              detail: e.message
            });

            await ctx.call('account-provisioning-state.finalize', {
              provisioningId,
              state: 'failed'
            });
          } catch (stateErr) {
            this.logger.warn(
              `Failed to update provisioning state after error in phase "${currentPhase}": ${stateErr.message}`
            );
          }

          const statusCode = Number.isFinite(Number(e.code)) ? Number(e.code) : 500;

          throw new MoleculerError(
            `Unified account provisioning failed during phase "${currentPhase}": ${e.message}`,
            statusCode,
            e.type || 'UNIFIED_ACCOUNT_PROVISIONING_FAILED',
            { phase: currentPhase }
          );
        }
      }
    }
  },

  methods: {
    requestedProtocolsFromInput(input) {
      return {
        solid: input.solid?.enabled ?? this.settings.defaults.enableSolid,
        activitypub: input.activitypub?.enabled ?? this.settings.defaults.enableActivityPub,
        atproto: input.atproto?.enabled ?? this.settings.defaults.enableAtproto
      };
    }
  }
};
