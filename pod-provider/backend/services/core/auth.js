const path = require('path');
const urlJoin = require('url-join');
const { AuthLocalService } = require('@semapps/auth');
const CONFIG = require('../../config/config');
const transport = require('../../config/transport');

module.exports = {
  mixins: [AuthLocalService],
  dependencies: ['dataset-provisioning', 'atproto-provisioning'],
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
      didMethod: process.env.APODS_ATPROTO_DID_METHOD || 'plc'
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

      try {
        const profileData = { nick: accountData.username, email: accountData.email, ...rest };
        const webId = await ctx.call('webid.createWebId', this.pickWebIdData(profileData), {
          meta: {
            isSignup: true
          }
        });

        accountData = await ctx.call('auth.account.attachWebId', { accountUri: accountData['@id'], webId });

        let atprotoProvisioning = null;
        if (this.settings.atproto.autoProvisionOnSignup) {
          try {
            atprotoProvisioning = await ctx.call('atproto-provisioning.provisionForAccount', {
              canonicalAccountId: webId,
              webId,
              didMethod: this.settings.atproto.didMethod,
              profile: {
                displayName: rest?.name || accountData?.username || username,
                ...(rest?.summary ? { summary: rest.summary } : {})
              }
            });
          } catch (e) {
            this.logger.error(`[Auth] ATProto provisioning failed for ${webId}: ${e.message}`);
            throw new MoleculerError(
              `ATProto provisioning failed during signup: ${e.message}`,
              Number.isFinite(Number(e.code)) ? Number(e.code) : 500,
              e.type || 'ATPROTO_PROVISIONING_FAILED'
            );
          }
        }

        ctx.emit('auth.registered', { webId, profileData, accountData });

        const token = await ctx.call('auth.jwt.generateServerSignedToken', { payload: { webId } });

        return {
          token,
          webId,
          newUser: true,
          ...(atprotoProvisioning
            ? {
                atprotoDid: atprotoProvisioning.did,
                atprotoHandle: atprotoProvisioning.handle,
                atprotoRepoInitialized: !!atprotoProvisioning.repoInitialized
              }
            : {})
        };
      } catch (e) {
        await ctx.call('auth.account.remove', { id: accountData['@id'] });
        throw e;
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
