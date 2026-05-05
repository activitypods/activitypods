const path = require('path');
const urlJoin = require('url-join');
const {
  Errors: { MoleculerError }
} = require('moleculer');
const { AuthLocalService } = require('@semapps/auth');
const CONFIG = require('../../config/config');
const transport = require('../../config/transport');

module.exports = {
  mixins: [AuthLocalService],
  dependencies: ['dataset-provisioning', 'activitypub-provisioning', 'atproto-provisioning'],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    jwtPath: path.resolve(__dirname, '../../jwt'),
    accountsDataset: CONFIG.AUTH_ACCOUNTS_DATASET,
    reservedUsernames: CONFIG.AUTH_RESERVED_USER_NAMES,
    minPasswordLength: 8, // Same as frontend requirement
    minUsernameLength: 2,
    webIdSelection: ['nick', 'schema:knowsLanguage'],
    formUrl: CONFIG.FRONTEND_URL ? urlJoin(CONFIG.FRONTEND_URL, 'login') : undefined,
    podProvider: true,
    mail: {
      from: `${CONFIG.FROM_NAME} <${CONFIG.FROM_EMAIL}>`,
      transport,
      defaults: {
        locale: CONFIG.DEFAULT_LOCALE,
        frontUrl: CONFIG.FRONTEND_URL
      }
    },
    atproto: {
      autoProvisionOnSignup: process.env.APODS_AUTO_PROVISION_ATPROTO_ON_SIGNUP !== 'false',
      didMethod: process.env.APODS_ATPROTO_DID_METHOD || 'plc',
      // Bound on how long signup will wait for the /data/key container to
      // appear before failing fast. Prevents indefinite hangs if event
      // listeners crash or are slow to bootstrap pod containers.
      keyContainerWaitTimeoutMs: Number(process.env.APODS_KEY_CONTAINER_WAIT_TIMEOUT_MS || 30_000)
    }
  },
  actions: {
    async signup(ctx) {
      const { username, email, password, ...rest } = ctx.params;

      ctx.meta.skipObjectsWatcher = true;
      this.logger.info(`[Auth] signup start for ${username}`);

      if (username) {
        await ctx.call('username-moderation.assertSafe', {
          username,
          flow: 'signup',
          email: email || undefined
        });
        this.logger.info(`[Auth] signup moderation passed for ${username}`);

        await ctx.call('dataset-provisioning.ensureSecureDataset', {
          dataset: String(username).trim().toLowerCase()
        });

        const datasetExists = await ctx.call('triplestore.dataset.exist', {
          dataset: String(username).trim().toLowerCase()
        });

        this.logger.info(`[Auth] dataset check for ${username}: ${datasetExists ? 'exists' : 'missing'}`);
      }

      let accountData = await ctx.call('auth.account.create', {
        username,
        email,
        password,
        ...this.pickAccountData(rest)
      });

      // Hoisted so the outer catch can reference it for rollback even if
      // webid.createWebId itself throws.
      let webId = null;
      try {
        const profileData = { nick: accountData.username, email: accountData.email, ...rest };
        webId = await ctx.call('webid.createWebId', this.pickWebIdData(profileData), {
          meta: {
            isSignup: true
          }
        });

        accountData = await ctx.call('auth.account.attachWebId', { accountUri: accountData['@id'], webId });

        // Emit auth.registered first so event listeners (solid.storage, ldp containers, activitypub actor, etc.)
        // begin creating the pod storage containers and actor synchronously.
        ctx.emit('auth.registered', { webId, profileData, accountData });

        let activityPubProvisioning = null;
        let atprotoProvisioning = null;
        if (this.settings.atproto.autoProvisionOnSignup) {
          try {
            // Wait for the key container (/data/key) before reading the
            // ActivityPub actor or generating AT keys. The container and actor
            // are created asynchronously by auth.registered listeners.
            await this._waitForKeyContainerWithTimeout(ctx, webId);

            activityPubProvisioning = await ctx.call('activitypub-provisioning.provisionForAccount', {
              canonicalAccountId: webId,
              webId,
              username: accountData.username || username,
              profile: {
                displayName: rest?.name || accountData?.username || username,
                ...(rest?.summary ? { summary: rest.summary } : {})
              }
            });

            atprotoProvisioning = await ctx.call('atproto-provisioning.provisionForAccount', {
              canonicalAccountId: webId,
              webId,
              requestedHandle: accountData.username || username,
              activityPubActorId: activityPubProvisioning?.actorId || webId,
              activityPubHandle: activityPubProvisioning?.handle || null,
              didMethod: this.settings.atproto.didMethod,
              profile: {
                displayName: rest?.name || accountData?.username || username,
                ...(rest?.summary ? { summary: rest.summary } : {})
              }
            });
          } catch (e) {
            this.logger.error(`[Auth] ATProto provisioning failed for ${webId}: ${e.message}`);
            // Best-effort cleanup of any partial AT artifacts before the
            // outer catch removes the account. Each step is isolated so a
            // failure in one does not block the others.
            await this._cleanupPartialAtprotoArtifacts(ctx, webId);
            throw new MoleculerError(
              `ATProto provisioning failed during signup: ${e.message}`,
              Number.isFinite(Number(e.code)) ? Number(e.code) : 500,
              e.type || 'ATPROTO_PROVISIONING_FAILED'
            );
          }
        }

        const token = await ctx.call('auth.jwt.generateServerSignedToken', { payload: { webId } });

        return {
          token,
          webId,
          newUser: true,
          ...(activityPubProvisioning
            ? {
                activityPubActorId: activityPubProvisioning.actorId,
                activityPubHandle: activityPubProvisioning.handle
              }
            : {}),
          ...(atprotoProvisioning
            ? {
                atprotoDid: atprotoProvisioning.did,
                atprotoHandle: atprotoProvisioning.handle,
                atprotoPdsUrl: atprotoProvisioning.atprotoPdsUrl || null,
                atprotoRepoInitialized: !!atprotoProvisioning.repoInitialized
              }
            : {})
        };
      } catch (e) {
        // Outer rollback covers failures AFTER successful AT provisioning
        // (e.g. JWT generation). Best-effort, idempotent — safe to call
        // even when nothing was created.
        if (webId) {
          await this._cleanupPartialAtprotoArtifacts(ctx, webId).catch(() => {});
        }
        await ctx.call('auth.account.remove', { id: accountData['@id'] });
        throw e;
      }
    }
  },
  async started() {
    // The AuthLocalService mixin registers /auth/signup with toBottom:true (default),
    // placing it AFTER the LDP catch-all /:username/:slugParts* in moleculer-web's route list.
    // moleculer-web's addRoute() replaces in-place when names match (ignoring toBottom),
    // so we must remove the route first, then re-add at position 0 (toBottom:false).
    const { pathname: basePath } = new URL(this.settings.baseUrl);
    await this.broker.call('api.removeRoute', { name: 'auth-signup' });
    await this.broker.call('api.addRoute', {
      route: {
        name: 'auth-signup',
        path: `${basePath}/auth/signup`.replace(/\/+/g, '/'),
        aliases: { 'POST /': 'auth.signup' }
      },
      toBottom: false
    });
    this.logger.info('[Auth] /auth/signup route promoted above LDP catch-all');
  },
  methods: {
    /**
     * Race the key-container poll against a hard timeout. Throws
     * KEY_CONTAINER_WAIT_TIMEOUT if the container does not appear in time.
     */
    async _waitForKeyContainerWithTimeout(ctx, webId) {
      const timeoutMs = Math.max(1_000, Number(this.settings.atproto.keyContainerWaitTimeoutMs) || 30_000);
      let timer;
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new MoleculerError(
              `Timed out waiting for key container for ${webId} after ${timeoutMs}ms`,
              504,
              'KEY_CONTAINER_WAIT_TIMEOUT'
            )
          );
        }, timeoutMs);
        // Allow the process to exit naturally during shutdown.
        if (typeof timer.unref === 'function') timer.unref();
      });
      try {
        await Promise.race([ctx.call('keys.container.waitForContainerCreation', { webId }), timeoutPromise]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    },

    /**
     * Best-effort rollback of partial AT artifacts created earlier in the
     * signup flow. Each step swallows its own errors and logs at warn so
     * one failure cannot mask the underlying provisioning error or block
     * account removal in the outer catch.
     */
    async _cleanupPartialAtprotoArtifacts(ctx, webId) {
      try {
        await ctx.call('identitybindings.remove', { canonicalAccountId: webId });
      } catch (err) {
        this.logger.warn(`[Auth] rollback: identitybindings.remove failed for ${webId}: ${err.message}`);
      }
      try {
        await ctx.call('keys.deleteAllKeysForWebId', { webId });
      } catch (err) {
        this.logger.warn(`[Auth] rollback: keys.deleteAllKeysForWebId failed for ${webId}: ${err.message}`);
      }
    }
  },
  hooks: {
    after: {
      async signup(ctx, res) {
        if (process.env.NODE_ENV !== 'production') {
          return res;
        }

        const allowIncompleteSignupBootstrap =
          process.env.SEMAPPS_ALLOW_INCOMPLETE_SIGNUP_BOOTSTRAP === 'true' || process.env.NODE_ENV !== 'production';

        const { webId } = res;

        try {
          await ctx.call('auth-agent.waitForResourceCreation', { webId });
          await ctx.call('agent-registry.waitForResourceCreation', { webId });
          await ctx.call('auth-registry.waitForResourceCreation', { webId });
          await ctx.call('data-registry.waitForResourceCreation', { webId });

          await ctx.call('activitypub.actor.awaitCreateComplete', {
            actorUri: webId,
            additionalKeys: [
              'pim:storage',
              'pim:preferencesFile',
              'interop:hasAuthorizationAgent',
              'interop:hasRegistrySet',
              'solid:publicTypeIndex'
            ]
          });

          // Wait until all data and type registrations are created
          // This is necessary for the data provider to be able to load all containers
          await ctx.call('data-registry.awaitCreateComplete', { webId });
          await ctx.call('type-indexes.awaitCreateComplete', { webId });
        } catch (e) {
          if (!allowIncompleteSignupBootstrap) throw e;

          this.logger.warn(`[Auth] Continuing signup with incomplete local bootstrap for ${webId}: ${e.message}`);
        }

        return res;
      }
    }
  }
};
