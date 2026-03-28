const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;

module.exports = {
  name: 'atproto-provisioning',

  dependencies: ['keys', 'identitybindings', 'signing'],

  settings: {
    internalBearerToken: process.env.ACTIVITYPODS_TOKEN || '',
    repoBootstrapRootCid:
      process.env.ATPROTO_REPO_BOOTSTRAP_ROOT_CID || 'bafyreigenesisplaceholder',
    repoBootstrapRev:
      process.env.ATPROTO_REPO_BOOTSTRAP_REV || '0'
  },

  actions: {
    provisionForAccount: {
      params: {
        canonicalAccountId: 'string|min:1',
        webId: 'string|min:1',
        requestedHandle: { type: 'string', optional: true },
        didMethod: { type: 'enum', values: ['plc', 'web'], default: 'plc' },
        profile: {
          type: 'object',
          optional: true,
          props: {
            displayName: { type: 'string', optional: true },
            summary: { type: 'string', optional: true }
          }
        },
        force: { type: 'boolean', optional: true, default: false }
      },
      async handler(ctx) {
        const { canonicalAccountId, webId, requestedHandle, didMethod, force } = ctx.params;

        if (canonicalAccountId !== webId) {
          throw new MoleculerError(
            'Current AT provisioning path requires canonicalAccountId to equal webId',
            400,
            'CANONICAL_ACCOUNT_ID_WEBID_MISMATCH'
          );
        }

        const existing = await ctx.call('identitybindings.getByCanonicalAccountId', {
          canonicalAccountId
        });

        if (existing && !force) {
          if (!existing.repoInitialized || !existing.repoRootCid || !existing.repoRev) {
            await this.initializeRepoState(ctx, {
              canonicalAccountId,
              did: existing.atprotoDid,
              handle: existing.atprotoHandle
            });
          }

          const refreshed = await ctx.call('identitybindings.getByCanonicalAccountId', {
            canonicalAccountId
          });

          await this.verifyProvisionedState(ctx, {
            canonicalAccountId,
            binding: refreshed || existing,
            didMethod
          });

          return {
            did: (refreshed || existing).atprotoDid,
            handle: (refreshed || existing).atprotoHandle,
            atSigningKeyRef: (refreshed || existing).atSigningKeyRef,
            atRotationKeyRef: (refreshed || existing).atRotationKeyRef,
            repoInitialized: Boolean((refreshed || existing).repoInitialized),
            createdAt: (refreshed || existing).createdAt || new Date().toISOString()
          };
        }

        const keyMeta = this._buildKeyMeta(webId);

        const commitKey = await ctx.call(
          'keys.generateSecp256k1Key',
          {
            webId,
            attachToWebId: false,
            publishKey: false
          },
          { meta: keyMeta }
        );

        const rotationKey = await ctx.call(
          'keys.generateSecp256k1Key',
          {
            webId,
            attachToWebId: false,
            publishKey: false
          },
          { meta: keyMeta }
        );

        if (!commitKey?.keyRef || !rotationKey?.keyRef) {
          throw new MoleculerError('AT key generation failed to return key refs', 500, 'ATPROTO_KEY_GENERATION_FAILED');
        }

        if (commitKey.keyRef === rotationKey.keyRef) {
          throw new MoleculerError('Commit signing key and rotation key must be distinct', 500, 'ATPROTO_KEY_COLLISION');
        }

        const atprotoHandle = await this.resolveHandle({
          usernameHint: requestedHandle,
          canonicalAccountId,
          webId
        });

        const atprotoDid =
          didMethod === 'plc'
            ? await this.createPlcDid(ctx, {
                canonicalAccountId,
                webId,
                handle: atprotoHandle,
                commitKeyRef: commitKey.keyRef,
                rotationKeyRef: rotationKey.keyRef
              })
            : await this.createDidWeb(ctx, {
                canonicalAccountId,
                webId,
                handle: atprotoHandle
              });

        await ctx.call('identitybindings.upsert', {
          canonicalAccountId,
          webId,
          atprotoDid,
          atprotoHandle,
          atprotoSource: 'local',
          atprotoManaged: true,
          atSigningKeyRef: commitKey.keyRef,
          atRotationKeyRef: rotationKey.keyRef,
          status: 'active'
        });

        await this.initializeRepoState(ctx, {
          canonicalAccountId,
          did: atprotoDid,
          handle: atprotoHandle
        });

        const binding = await ctx.call('identitybindings.getByCanonicalAccountId', {
          canonicalAccountId
        });

        await this.verifyProvisionedState(ctx, {
          canonicalAccountId,
          binding,
          didMethod
        });

        return {
          did: binding.atprotoDid,
          handle: binding.atprotoHandle,
          atSigningKeyRef: binding.atSigningKeyRef,
          atRotationKeyRef: binding.atRotationKeyRef,
          repoInitialized: Boolean(binding.repoInitialized),
          createdAt: binding.createdAt || new Date().toISOString()
        };
      }
    }
  },

  methods: {
    _buildKeyMeta(webId) {
      const parsed = new URL(webId);
      const dataset = parsed.pathname.split('/').filter(Boolean)[0] || 'default';
      return {
        dataset,
        webId
      };
    },

    _signingCallMeta() {
      if (!this.settings.internalBearerToken) return {};
      return {
        meta: {
          $headers: {
            authorization: `Bearer ${this.settings.internalBearerToken}`
          }
        }
      };
    },

    async resolveHandle({ usernameHint, canonicalAccountId, webId }) {
      if (usernameHint && usernameHint.trim().length > 0) {
        return usernameHint.trim().toLowerCase();
      }

      const source = webId || canonicalAccountId;
      const normalized = source
        .replace(/^https?:\/\//, '')
        .replace(/[^\w.-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase();

      return `${normalized}.test`;
    },

    async createPlcDid(_ctx, { canonicalAccountId, webId, handle, commitKeyRef, rotationKeyRef }) {
      const hash = crypto
        .createHash('sha256')
        .update(`${canonicalAccountId}|${webId}|${handle}|${commitKeyRef}|${rotationKeyRef}`)
        .digest('hex')
        .slice(0, 24);

      return `did:plc:${hash}`;
    },

    async createDidWeb(_ctx, { handle }) {
      return `did:web:${handle}`;
    },

    async initializeRepoState(_ctx, { canonicalAccountId, did, handle }) {
      await _ctx.call('identitybindings.upsertRepoBootstrap', {
        canonicalAccountId,
        did,
        handle,
        repoInitialized: true,
        rootCid: this.settings.repoBootstrapRootCid,
        rev: this.settings.repoBootstrapRev
      });

      return {
        ok: true,
        canonicalAccountId,
        did,
        handle,
        rootCid: this.settings.repoBootstrapRootCid,
        rev: this.settings.repoBootstrapRev
      };
    },

    async verifyProvisionedState(ctx, { canonicalAccountId, binding, didMethod }) {
      if (!binding?.atSigningKeyRef || !binding?.atRotationKeyRef) {
        throw new MoleculerError('Identity binding is missing AT key refs', 500, 'ATPROTO_BINDING_INVALID');
      }

      if (!binding?.atprotoDid || !binding?.atprotoHandle) {
        throw new MoleculerError('Identity binding is missing DID or handle', 500, 'ATPROTO_BINDING_INVALID');
      }

      if (!binding?.repoInitialized || !binding?.repoRootCid || !binding?.repoRev) {
        throw new MoleculerError(
          'Identity binding is missing repo bootstrap state',
          500,
          'ATPROTO_REPO_BOOTSTRAP_INVALID'
        );
      }

      const signingMeta = this._signingCallMeta();

      await ctx.call(
        'signing.getAtprotoPublicKey',
        {
          canonicalAccountId,
          purpose: 'commit'
        },
        signingMeta
      );

      await ctx.call(
        'signing.getAtprotoPublicKey',
        {
          canonicalAccountId,
          purpose: 'rotation'
        },
        signingMeta
      );

      if (didMethod === 'plc' && !binding.atprotoDid.startsWith('did:plc:')) {
        throw new MoleculerError('Provisioned DID does not match requested did:plc method', 500, 'ATPROTO_DID_METHOD_MISMATCH');
      }

      if (didMethod === 'web' && !binding.atprotoDid.startsWith('did:web:')) {
        throw new MoleculerError('Provisioned DID does not match requested did:web method', 500, 'ATPROTO_DID_METHOD_MISMATCH');
      }
    }
  }
};
