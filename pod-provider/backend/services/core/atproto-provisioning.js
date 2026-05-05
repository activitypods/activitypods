const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;

// ATProto handle syntax (RFC-1035 hostname, ≥2 labels, TLD does not start
// with a digit). See https://atproto.com/specs/handle
const HANDLE_HOSTNAME_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;

// 253 (max DNS name) − 9 (`_atproto.` prefix used by the DNS TXT
// resolution method) = 244. Spec recommends this practical ceiling so a
// handle can always be resolved via DNS TXT.
const HANDLE_MAX_LENGTH = 244;

// TLDs reserved for testing/development per RFC 6761 and the atproto handle
// spec. Refused in production deployments to prevent unresolvable handles.
const RESERVED_DEV_TLDS = new Set([
  'test',
  'localhost',
  'local',
  'invalid',
  'example',
  'internal',
  'alt',
  'arpa',
  'onion'
]);

const BASE32_LOWER_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/* eslint-disable no-bitwise */
/**
 * RFC 4648 base32-lower without padding, used for did:plc identifiers.
 * @param {Buffer} bytes bytes to encode
 * @returns {string} base32-lower encoded value
 */
function base32LowerEncode(bytes) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let index = 0; index < bytes.length; index += 1) {
    value = (value << 8) | bytes[index];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      output += BASE32_LOWER_ALPHABET[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    output += BASE32_LOWER_ALPHABET[(value << (5 - bits)) & 0x1f];
  }
  return output;
}
/* eslint-enable no-bitwise */

module.exports = {
  name: 'atproto-provisioning',

  dependencies: ['keys', 'identitybindings', 'signing', 'atproto-plc-submitter'],

  settings: {
    internalBearerToken: process.env.ACTIVITYPODS_TOKEN || '',
    repoBootstrapRootCid: process.env.ATPROTO_REPO_BOOTSTRAP_ROOT_CID || 'bafyreigenesisplaceholder',
    repoBootstrapRev: process.env.ATPROTO_REPO_BOOTSTRAP_REV || '0',
    // Local PDS endpoint for Pod-bound, locally managed AT identities.
    // Defaults to the Pod origin derived from the account's WebID. An explicit
    // override (e.g. when the sidecar is exposed on a different host) is
    // applied uniformly across all locally provisioned accounts.
    localPdsBaseUrl: process.env.APODS_ATPROTO_LOCAL_PDS_BASE_URL || '',
    handleDomain: process.env.APODS_ATPROTO_HANDLE_DOMAIN || '',
    plcDirectoryUrl: process.env.APODS_ATPROTO_PLC_DIRECTORY_URL || 'https://plc.directory',
    // Allow mock-mode DID creation (sha256-derived did:plc, did:web with
    // dev-only TLDs). MUST be false in production environments where DIDs
    // need to be resolvable on plc.directory or via real DNS+HTTPS.
    allowMockAtprotoIdentity:
      process.env.APODS_ATPROTO_ALLOW_MOCK_IDENTITY === 'true' || process.env.NODE_ENV !== 'production',
    plcSubmissionEnabled: process.env.APODS_ATPROTO_ENABLE_PLC_SUBMISSION === 'true'
  },

  actions: {
    provisionForAccount: {
      params: {
        canonicalAccountId: 'string|min:1',
        webId: 'string|min:1',
        requestedHandle: { type: 'string', optional: true },
        activityPubActorId: { type: 'string', optional: true },
        activityPubHandle: { type: 'string', optional: true },
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
        const { canonicalAccountId, webId, requestedHandle, activityPubActorId, activityPubHandle, didMethod, force } =
          ctx.params;

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

        if (existing && force && didMethod === 'plc' && this.settings.plcSubmissionEnabled) {
          throw new MoleculerError(
            'Forced PLC reprovisioning is unsafe for an existing identity; use explicit repair/rotation tooling instead.',
            409,
            'ATPROTO_PLC_FORCE_REPROVISION_REFUSED',
            { canonicalAccountId, existingDid: existing.atprotoDid || null }
          );
        }

        if (existing && !force) {
          if (this._isRecoverablePlcProvisioningBinding(existing, didMethod)) {
            const recovered = await this._completePendingPlcProvisioning(ctx, {
              canonicalAccountId,
              webId,
              binding: existing
            });
            return recovered;
          }

          if (!existing.atprotoDid || !existing.atprotoHandle) {
            throw new MoleculerError(
              'Existing AT identity binding is incomplete and cannot be completed under current configuration',
              503,
              'ATPROTO_PROVISIONING_INCOMPLETE',
              {
                canonicalAccountId,
                hasDid: Boolean(existing.atprotoDid),
                hasHandle: Boolean(existing.atprotoHandle),
                plcSubmissionEnabled: this.settings.plcSubmissionEnabled
              }
            );
          }

          if (!existing.repoInitialized || !existing.repoRootCid || !existing.repoRev) {
            await this.initializeRepoState(ctx, {
              canonicalAccountId,
              did: existing.atprotoDid,
              handle: existing.atprotoHandle
            });
          }

          // Backfill Pod-bound PDS URL on existing local-managed bindings
          // that predate this policy. Source: 'external' bindings are left
          // untouched so external linkage is preserved.
          const isLocalManaged = existing.atprotoSource !== 'external' && existing.atprotoManaged !== false;
          const expectedPdsUrl = this._resolveLocalPdsUrl(webId);
          if (isLocalManaged && expectedPdsUrl && !existing.atprotoPdsUrl) {
            await ctx.call('identitybindings.upsert', {
              canonicalAccountId,
              webId,
              atprotoPdsUrl: expectedPdsUrl
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
            atprotoPdsUrl: (refreshed || existing).atprotoPdsUrl || null,
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
          throw new MoleculerError(
            'Commit signing key and rotation key must be distinct',
            500,
            'ATPROTO_KEY_COLLISION'
          );
        }

        const atprotoHandle = await this.resolveHandle({
          usernameHint: requestedHandle,
          canonicalAccountId,
          webId
        });

        const localPdsUrl = this._resolveLocalPdsUrl(webId);
        if (!localPdsUrl) {
          throw new MoleculerError(
            'Unable to derive local PDS URL for Pod-bound AT identity',
            500,
            'ATPROTO_LOCAL_PDS_URL_UNRESOLVED'
          );
        }

        if (didMethod === 'plc' && this.settings.plcSubmissionEnabled) {
          await this._writeProvisionalAtprotoBinding(ctx, {
            canonicalAccountId,
            webId,
            activityPubActorId,
            activityPubHandle,
            atprotoHandle,
            localPdsUrl,
            commitKeyRef: commitKey.keyRef,
            rotationKeyRef: rotationKey.keyRef
          });
        }

        const atprotoDid =
          didMethod === 'plc'
            ? await this.createPlcDid(ctx, {
                canonicalAccountId,
                webId,
                handle: atprotoHandle,
                commitKeyRef: commitKey.keyRef,
                rotationKeyRef: rotationKey.keyRef,
                pdsEndpoint: localPdsUrl
              })
            : await this.createDidWeb(ctx, {
                canonicalAccountId,
                webId,
                handle: atprotoHandle
              });

        await ctx.call('identitybindings.upsert', {
          canonicalAccountId,
          webId,
          activityPubActorId,
          activityPubHandle,
          atprotoDid,
          atprotoHandle,
          atprotoSource: 'local',
          atprotoManaged: true,
          atprotoPdsUrl: localPdsUrl,
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
          atprotoPdsUrl: binding.atprotoPdsUrl || null,
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

    _isRecoverablePlcProvisioningBinding(binding, didMethod) {
      return Boolean(
        didMethod === 'plc' &&
          this.settings.plcSubmissionEnabled &&
          binding &&
          !binding.atprotoDid &&
          binding.atprotoHandle &&
          binding.atSigningKeyRef &&
          binding.atRotationKeyRef
      );
    },

    async _writeProvisionalAtprotoBinding(
      ctx,
      {
        canonicalAccountId,
        webId,
        activityPubActorId,
        activityPubHandle,
        atprotoHandle,
        localPdsUrl,
        commitKeyRef,
        rotationKeyRef
      }
    ) {
      await ctx.call('identitybindings.upsert', {
        canonicalAccountId,
        webId,
        activityPubActorId,
        activityPubHandle,
        atprotoHandle,
        atprotoSource: 'local',
        atprotoManaged: true,
        atprotoPdsUrl: localPdsUrl,
        atSigningKeyRef: commitKeyRef,
        atRotationKeyRef: rotationKeyRef,
        status: 'pending-plc'
      });
    },

    async _completePendingPlcProvisioning(ctx, { canonicalAccountId, webId, binding }) {
      const localPdsUrl = binding.atprotoPdsUrl || this._resolveLocalPdsUrl(webId);
      if (!localPdsUrl) {
        throw new MoleculerError(
          'Unable to derive local PDS URL for pending PLC identity',
          500,
          'ATPROTO_LOCAL_PDS_URL_UNRESOLVED'
        );
      }

      const atprotoDid = await this.createPlcDid(ctx, {
        canonicalAccountId,
        webId,
        handle: binding.atprotoHandle,
        commitKeyRef: binding.atSigningKeyRef,
        rotationKeyRef: binding.atRotationKeyRef,
        pdsEndpoint: localPdsUrl
      });

      await ctx.call('identitybindings.upsert', {
        canonicalAccountId,
        webId,
        atprotoDid,
        atprotoHandle: binding.atprotoHandle,
        atprotoSource: 'local',
        atprotoManaged: true,
        atprotoPdsUrl: localPdsUrl,
        atSigningKeyRef: binding.atSigningKeyRef,
        atRotationKeyRef: binding.atRotationKeyRef,
        status: 'active'
      });

      await this.initializeRepoState(ctx, {
        canonicalAccountId,
        did: atprotoDid,
        handle: binding.atprotoHandle
      });

      const refreshed = await ctx.call('identitybindings.getByCanonicalAccountId', {
        canonicalAccountId
      });

      await this.verifyProvisionedState(ctx, {
        canonicalAccountId,
        binding: refreshed,
        didMethod: 'plc'
      });

      return {
        did: refreshed.atprotoDid,
        handle: refreshed.atprotoHandle,
        atSigningKeyRef: refreshed.atSigningKeyRef,
        atRotationKeyRef: refreshed.atRotationKeyRef,
        atprotoPdsUrl: refreshed.atprotoPdsUrl || null,
        repoInitialized: Boolean(refreshed.repoInitialized),
        createdAt: refreshed.createdAt || new Date().toISOString()
      };
    },

    /**
     * Derive the local PDS URL for a Pod-bound AT identity.
     *
     * Policy: a locally managed AT identity is bound 1:1 to the Pod that
     * hosts the WebID. The PDS endpoint therefore lives at the WebID's
     * origin (scheme + host + port). An explicit override via
     * APODS_ATPROTO_LOCAL_PDS_BASE_URL takes precedence (used when the
     * sidecar is exposed on a different public host).
     */
    _resolveLocalPdsUrl(webId) {
      const override = (this.settings.localPdsBaseUrl || '').trim();
      if (override) {
        try {
          const u = new URL(override);
          return `${u.protocol}//${u.host}`;
        } catch (_) {
          return '';
        }
      }
      try {
        const u = new URL(webId);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
        return `${u.protocol}//${u.host}`;
      } catch {
        return '';
      }
    },

    async resolveHandle({ usernameHint, canonicalAccountId, webId }) {
      const rawHint = String(usernameHint || '')
        .trim()
        .toLowerCase();
      const candidate = rawHint || this._usernameFromWebId(webId || canonicalAccountId);

      // If caller supplied a syntactically valid hostname (DNS-like), keep it.
      // Otherwise derive from the ActivityPods username. Production should set
      // APODS_ATPROTO_HANDLE_DOMAIN so Alice becomes alice.example.com;
      // development without a domain uses alice.test.
      const handle = HANDLE_HOSTNAME_RE.test(candidate)
        ? candidate
        : `${this._handleLabelFromUsername(candidate)}.${this._effectiveHandleDomain()}`;

      this._assertHandleSpecCompliant(handle);
      this._assertHandleSafeForEnvironment(handle);
      return handle;
    },

    _usernameFromWebId(webId) {
      try {
        const parsed = new URL(webId);
        return (parsed.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
      } catch {
        return String(webId || '')
          .replace(/^https?:\/\//, '')
          .replace(/[^a-zA-Z0-9-]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '')
          .toLowerCase();
      }
    },

    _handleLabelFromUsername(username) {
      const label = String(username || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      if (!label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
        throw new MoleculerError(
          'Unable to derive an AT handle label from username',
          400,
          'ATPROTO_HANDLE_LABEL_INVALID'
        );
      }
      return label;
    },

    _effectiveHandleDomain() {
      const domain = String(this.settings.handleDomain || '')
        .trim()
        .toLowerCase()
        .replace(/^\.+|\.+$/g, '');
      if (!domain) return 'test';
      if (!HANDLE_HOSTNAME_RE.test(`placeholder.${domain}`)) {
        throw new MoleculerError(
          'APODS_ATPROTO_HANDLE_DOMAIN must be a valid DNS hostname suffix',
          500,
          'ATPROTO_HANDLE_DOMAIN_INVALID'
        );
      }
      return domain;
    },

    /**
     * Enforce atproto handle syntax (https://atproto.com/specs/handle):
     *   • normalized lowercase
     *   • ≥2 labels, each 1-63 chars, [a-z0-9-] (no leading/trailing hyphen)
     *   • TLD does not start with a digit
     *   • overall length ≤ 244 chars (DNS 253 minus `_atproto.` prefix
     *     so the handle remains resolvable via the DNS TXT method)
     */
    _assertHandleSpecCompliant(handle) {
      if (typeof handle !== 'string' || handle.length === 0) {
        throw new MoleculerError('Empty AT handle', 400, 'ATPROTO_HANDLE_INVALID_SYNTAX');
      }
      if (handle.length > HANDLE_MAX_LENGTH) {
        throw new MoleculerError(
          `AT handle exceeds ${HANDLE_MAX_LENGTH} chars (DNS TXT resolution limit)`,
          400,
          'ATPROTO_HANDLE_TOO_LONG'
        );
      }
      if (!HANDLE_HOSTNAME_RE.test(handle)) {
        throw new MoleculerError(
          'AT handle does not match atproto handle syntax',
          400,
          'ATPROTO_HANDLE_INVALID_SYNTAX'
        );
      }
    },

    _assertHandleSafeForEnvironment(handle) {
      if (this.settings.allowMockAtprotoIdentity) return;
      const tld = handle.split('.').pop();
      if (RESERVED_DEV_TLDS.has(tld)) {
        throw new MoleculerError(
          `Refusing to mint AT handle with reserved dev TLD ".${tld}" in production`,
          500,
          'ATPROTO_HANDLE_RESERVED_TLD'
        );
      }
    },

    _assertHandleSafeForPlcSubmission(handle) {
      const directoryUrl = String(this.settings.plcDirectoryUrl || '').replace(/\/+$/, '');
      if (directoryUrl !== 'https://plc.directory') return;
      const tld = handle.split('.').pop();
      if (RESERVED_DEV_TLDS.has(tld)) {
        throw new MoleculerError(
          `Refusing to submit reserved dev handle ".${tld}" to the public PLC directory. Configure APODS_ATPROTO_PLC_DIRECTORY_URL for a sandbox.`,
          500,
          'ATPROTO_PLC_PUBLIC_DIRECTORY_DEV_HANDLE_REFUSED'
        );
      }
    },

    _assertPdsSafeForPlcSubmission(pdsEndpoint) {
      const directoryUrl = String(this.settings.plcDirectoryUrl || '').replace(/\/+$/, '');
      if (directoryUrl !== 'https://plc.directory') return;
      let parsed;
      try {
        parsed = new URL(pdsEndpoint);
      } catch (_) {
        throw new MoleculerError('PDS endpoint is not a valid URL', 500, 'ATPROTO_PLC_PDS_ENDPOINT_INVALID');
      }
      const tld = parsed.hostname.split('.').pop();
      if (parsed.protocol !== 'https:' || parsed.hostname === 'localhost' || RESERVED_DEV_TLDS.has(tld)) {
        throw new MoleculerError(
          'Refusing to submit a non-public PDS endpoint to the public PLC directory. Configure APODS_ATPROTO_PLC_DIRECTORY_URL for a sandbox.',
          500,
          'ATPROTO_PLC_PUBLIC_DIRECTORY_PDS_REFUSED'
        );
      }
    },

    async createPlcDid(ctx, { canonicalAccountId, webId, handle, commitKeyRef, rotationKeyRef, pdsEndpoint }) {
      if (this.settings.plcSubmissionEnabled) {
        this._assertHandleSafeForPlcSubmission(handle);
        if (!pdsEndpoint) {
          throw new MoleculerError(
            'Real did:plc provisioning requires a PDS endpoint',
            500,
            'ATPROTO_PLC_PDS_ENDPOINT_MISSING'
          );
        }
        this._assertPdsSafeForPlcSubmission(pdsEndpoint);

        const enqueue = await ctx.call('atproto-plc-submitter.buildAndEnqueue', {
          canonicalAccountId,
          handle,
          pdsEndpoint
        });

        const submitted = await ctx.call('atproto-plc-submitter.submit', {
          canonicalAccountId
        });

        if (submitted.status !== 'confirmed') {
          throw new MoleculerError(
            'did:plc genesis operation was queued but not confirmed by the PLC directory',
            503,
            'ATPROTO_PLC_SUBMISSION_PENDING',
            {
              did: enqueue.did,
              status: submitted.status,
              attempts: submitted.attempts || submitted.state?.attempts || 0,
              nextAttemptAt: submitted.nextAttemptAt || null,
              lastError: submitted.lastError || null
            }
          );
        }

        return enqueue.did;
      }

      // NOTE: This is a deterministic local placeholder, NOT a real PLC
      // genesis operation. Real did:plc requires a signed genesis op
      // submitted to https://plc.directory. Gate behind mock-identity flag
      // so production deployments fail fast rather than minting unresolvable
      // DIDs.
      if (!this.settings.allowMockAtprotoIdentity) {
        throw new MoleculerError(
          'Mock did:plc generation is disabled. Configure a real PLC submission path or set APODS_ATPROTO_ALLOW_MOCK_IDENTITY=true (non-prod only).',
          500,
          'ATPROTO_PLC_GENESIS_NOT_IMPLEMENTED'
        );
      }
      const hash = crypto
        .createHash('sha256')
        .update(`${canonicalAccountId}|${webId}|${handle}|${commitKeyRef}|${rotationKeyRef}`)
        .digest();

      return `did:plc:${base32LowerEncode(hash).slice(0, 24)}`;
    },

    async createDidWeb(_ctx, { handle }) {
      // Per atproto did:web spec, the DID identifier is a hostname that
      // serves /.well-known/did.json over HTTPS. Refuse to construct one
      // for a non-hostname or reserved dev TLD in production.
      if (!HANDLE_HOSTNAME_RE.test(handle)) {
        throw new MoleculerError('did:web requires a hostname-shaped handle', 500, 'ATPROTO_DID_WEB_INVALID_HANDLE');
      }
      this._assertHandleSafeForEnvironment(handle);
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
        throw new MoleculerError(
          'Provisioned DID does not match requested did:plc method',
          500,
          'ATPROTO_DID_METHOD_MISMATCH'
        );
      }

      if (didMethod === 'web' && !binding.atprotoDid.startsWith('did:web:')) {
        throw new MoleculerError(
          'Provisioned DID does not match requested did:web method',
          500,
          'ATPROTO_DID_METHOD_MISMATCH'
        );
      }

      // Pod-bound PDS policy: for locally managed bindings, the PDS URL must
      // be present and must match the Pod origin (or configured override).
      const isLocalManaged = binding.atprotoSource !== 'external' && binding.atprotoManaged !== false;
      if (isLocalManaged) {
        const expectedPdsUrl = this._resolveLocalPdsUrl(binding.webId);
        if (!binding.atprotoPdsUrl) {
          throw new MoleculerError(
            'Local-managed identity binding is missing atprotoPdsUrl',
            500,
            'ATPROTO_LOCAL_PDS_URL_MISSING'
          );
        }
        if (expectedPdsUrl && binding.atprotoPdsUrl !== expectedPdsUrl) {
          throw new MoleculerError(
            'Local-managed identity binding PDS URL does not match Pod origin',
            500,
            'ATPROTO_LOCAL_PDS_URL_DRIFT'
          );
        }
      }
    }
  },

  /**
   * Deployment alignment self-check.
   *
   * The Pod-bound PDS URL persisted on every identity binding must be
   * reachable by remote AT clients. Two env knobs are involved:
   *
   *   • APODS_ATPROTO_LOCAL_PDS_BASE_URL  (this service)
   *   • AT_PDS_HOSTNAME                   (fedify-sidecar)
   *
   * If both are unset we fall back to the WebID origin (SEMAPPS_HOME_URL
   * derived). At startup we resolve and log the effective endpoint, and in
   * production we hard-fail on common misconfigurations:
   *   • non-https scheme
   *   • path/userinfo/query/fragment present in the override
   *   • host with a reserved dev TLD (.test, .localhost, etc.)
   * so that ops finds out before the first signup, not after.
   */
  async started() {
    const sample = process.env.SEMAPPS_HOME_URL || 'http://localhost:3000';
    const effective = this._resolveLocalPdsUrl(sample);
    const isProd = process.env.NODE_ENV === 'production';

    if (!effective) {
      const msg = `[atproto-provisioning] cannot resolve local PDS URL (override=${this.settings.localPdsBaseUrl || '<unset>'}, sample=${sample})`;
      if (isProd) {
        throw new MoleculerError(msg, 500, 'ATPROTO_LOCAL_PDS_URL_UNRESOLVED');
      }
      this.logger.warn(msg);
      return;
    }

    let parsed;
    try {
      parsed = new URL(effective);
    } catch (_) {
      throw new MoleculerError(
        `[atproto-provisioning] resolved PDS URL is not a valid URL: ${effective}`,
        500,
        'ATPROTO_LOCAL_PDS_URL_INVALID'
      );
    }

    if (
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      (parsed.pathname && parsed.pathname !== '/')
    ) {
      throw new MoleculerError(
        `[atproto-provisioning] PDS URL must contain only scheme + host (+ optional port). Got: ${effective}`,
        500,
        'ATPROTO_LOCAL_PDS_URL_NOT_ORIGIN'
      );
    }

    const tld = parsed.hostname.split('.').pop();
    if (isProd && !this.settings.allowMockAtprotoIdentity) {
      if (parsed.protocol !== 'https:') {
        throw new MoleculerError(
          `[atproto-provisioning] PDS URL must use https:// in production. Got: ${effective}`,
          500,
          'ATPROTO_PDS_NOT_HTTPS'
        );
      }
      if (RESERVED_DEV_TLDS.has(tld) || parsed.hostname === 'localhost') {
        throw new MoleculerError(
          `[atproto-provisioning] PDS URL host has reserved dev TLD ".${tld}" in production. Got: ${effective}`,
          500,
          'ATPROTO_PDS_RESERVED_TLD'
        );
      }
    }

    this.logger.info(
      `[atproto-provisioning] effective PDS endpoint = ${effective} (mockIdentity=${this.settings.allowMockAtprotoIdentity}, didMethod-default=plc)`
    );
  }
};
