const { MoleculerError } = require('moleculer').Errors;

module.exports = {
  name: 'atproto-linking',

  dependencies: [
    'accounts',
    'auth.account',
    'webid-provisioning',
    'activitypub-provisioning',
    'identitybindings'
  ],

  actions: {
    linkExternalAccount: {
      params: {
        activitypods: {
          type: 'object',
          props: {
            canonicalAccountId: { type: 'string', optional: true },
            username: { type: 'string', optional: true },
            email: { type: 'string', optional: true },
            password: 'string|min:8',
            profile: {
              type: 'object',
              optional: true,
              props: {
                displayName: { type: 'string', optional: true },
                summary: { type: 'string', optional: true }
              }
            }
          }
        },
        verifiedAtproto: {
          type: 'object',
          props: {
            did: 'string|min:1',
            handle: 'string|min:1',
            pdsUrl: 'string|min:1',
            resolvedHandleDid: 'string|min:1',
            didDocument: 'object',
            signingKey: {
              type: 'object',
              props: {
                id: 'string|min:1',
                type: 'string|min:1',
                publicKeyMultibase: 'string|min:1'
              }
            },
            session: {
              type: 'object',
              props: {
                did: 'string|min:1',
                handle: { type: 'string', optional: true }
              }
            }
          }
        }
      },
      async handler(ctx) {
        const { activitypods, verifiedAtproto } = ctx.params;
        this.assertVerifiedIdentity(verifiedAtproto);

        const target = activitypods.canonicalAccountId
          ? await this.attachToExistingCanonicalAccount(ctx, activitypods)
          : await this.createCanonicalAccount(ctx, activitypods);

        const existingByDid = await ctx.call('identitybindings.getByDid', {
          atprotoDid: verifiedAtproto.did
        });
        if (
          existingByDid &&
          existingByDid.canonicalAccountId &&
          existingByDid.canonicalAccountId !== target.canonicalAccountId
        ) {
          throw new MoleculerError(
            'ATProto DID is already linked to a different canonical account',
            409,
            'ATPROTO_DID_ALREADY_LINKED'
          );
        }

        const existingByHandle = await ctx.call('identitybindings.getByHandle', {
          atprotoHandle: verifiedAtproto.handle
        });
        if (
          existingByHandle &&
          existingByHandle.canonicalAccountId &&
          existingByHandle.canonicalAccountId !== target.canonicalAccountId
        ) {
          throw new MoleculerError(
            'ATProto handle is already linked to a different canonical account',
            409,
            'ATPROTO_HANDLE_ALREADY_LINKED'
          );
        }

        const existing = await ctx.call('identitybindings.getByCanonicalAccountId', {
          canonicalAccountId: target.canonicalAccountId
        });
        if (existing?.atprotoDid && existing.atprotoDid !== verifiedAtproto.did) {
          throw new MoleculerError(
            'Canonical account is already linked to a different ATProto DID',
            409,
            'ATPROTO_ALREADY_LINKED'
          );
        }

        const binding = await ctx.call('identitybindings.upsert', {
          canonicalAccountId: target.canonicalAccountId,
          webId: target.webId,
          activityPubActorId: existing?.activityPubActorId || target.activityPubActorId || target.webId,
          activityPubHandle: existing?.activityPubHandle || target.activityPubHandle || null,
          atprotoDid: verifiedAtproto.did,
          atprotoHandle: verifiedAtproto.handle,
          atprotoSource: 'external',
          atprotoManaged: false,
          atprotoPdsUrl: verifiedAtproto.pdsUrl,
          atSigningKeyRef: null,
          atRotationKeyRef: null,
          status: 'active',
          repoInitialized: false,
          repoRootCid: null,
          repoRev: null
        });

        return {
          canonicalAccountId: binding.canonicalAccountId,
          webId: binding.webId,
          activityPubActorId: binding.activityPubActorId,
          activityPubHandle: binding.activityPubHandle,
          atproto: {
            did: binding.atprotoDid,
            handle: binding.atprotoHandle,
            source: binding.atprotoSource,
            managed: binding.atprotoManaged,
            pdsUrl: binding.atprotoPdsUrl
          },
          linking: {
            state: 'completed'
          }
        };
      }
    }
  },

  methods: {
    assertVerifiedIdentity(verifiedAtproto) {
      if (verifiedAtproto.session.did !== verifiedAtproto.did) {
        throw new MoleculerError(
          'ATProto session DID mismatch',
          400,
          'ATPROTO_SESSION_DID_MISMATCH'
        );
      }

      if (verifiedAtproto.resolvedHandleDid !== verifiedAtproto.did) {
        throw new MoleculerError(
          'ATProto handle does not resolve to DID',
          400,
          'ATPROTO_HANDLE_DID_MISMATCH'
        );
      }

      if (verifiedAtproto.session.handle) {
        const sessionHandle = String(verifiedAtproto.session.handle).trim().toLowerCase();
        const handle = String(verifiedAtproto.handle).trim().toLowerCase();
        if (sessionHandle !== handle) {
          throw new MoleculerError(
            'ATProto session handle mismatch',
            400,
            'ATPROTO_SESSION_HANDLE_MISMATCH'
          );
        }
      }

      this.assertDidDocumentClaimsHandle({
        didDocument: verifiedAtproto.didDocument,
        did: verifiedAtproto.did,
        handle: verifiedAtproto.handle
      });
      this.assertDidDocumentHasAtprotoKey({
        didDocument: verifiedAtproto.didDocument,
        did: verifiedAtproto.did
      });
      this.assertDidDocumentPdsMatches({
        didDocument: verifiedAtproto.didDocument,
        did: verifiedAtproto.did,
        pdsUrl: verifiedAtproto.pdsUrl
      });
    },

    async attachToExistingCanonicalAccount(ctx, activitypods) {
      const canonicalAccountId = String(activitypods.canonicalAccountId || '').trim();
      const account = await ctx.call('auth.account.findByWebId', {
        webId: canonicalAccountId
      });

      if (!account?.webId || !account.username) {
        throw new MoleculerError(
          'Canonical ActivityPods account was not found',
          404,
          'ACTIVITYPODS_ACCOUNT_NOT_FOUND'
        );
      }

      try {
        await ctx.call('auth.account.verify', {
          username: account.username,
          password: activitypods.password
        });
      } catch (_error) {
        throw new MoleculerError(
          'ActivityPods account verification failed',
          401,
          'ACTIVITYPODS_ACCOUNT_AUTH_FAILED'
        );
      }

      const activitypub = await ctx.call('activitypub-provisioning.provisionForAccount', {
        canonicalAccountId: account.webId,
        webId: account.webId,
        username: account.username,
        profile: activitypods.profile
      });

      return {
        canonicalAccountId: account.webId,
        webId: account.webId,
        activityPubActorId: activitypub?.actorId || account.webId,
        activityPubHandle: activitypub?.handle || null
      };
    },

    async createCanonicalAccount(ctx, activitypods) {
      const username = String(activitypods.username || '').trim();
      const displayName = String(activitypods.profile?.displayName || '').trim();

      if (!username) {
        throw new MoleculerError(
          'username is required when creating a new canonical account',
          400,
          'ACTIVITYPODS_USERNAME_REQUIRED'
        );
      }

      if (!displayName) {
        throw new MoleculerError(
          'profile.displayName is required when creating a new canonical account',
          400,
          'ACTIVITYPODS_PROFILE_REQUIRED'
        );
      }

      const canonical = await ctx.call('accounts.create', {
        username,
        email: activitypods.email,
        password: activitypods.password,
        profile: {
          displayName,
          ...(activitypods.profile?.summary ? { summary: activitypods.profile.summary } : {})
        }
      });

      const solid = await ctx.call('webid-provisioning.create', {
        canonicalAccountId: canonical.canonicalAccountId,
        username,
        profile: activitypods.profile
      });

      const activitypub = await ctx.call('activitypub-provisioning.provisionForAccount', {
        canonicalAccountId: canonical.canonicalAccountId,
        webId: solid.webId,
        username,
        profile: activitypods.profile
      });

      return {
        canonicalAccountId: canonical.canonicalAccountId,
        webId: solid.webId,
        activityPubActorId: activitypub?.actorId || solid.webId,
        activityPubHandle: activitypub?.handle || null
      };
    },

    assertDidDocumentClaimsHandle({ didDocument, did, handle }) {
      if (didDocument.id !== did) {
        throw new MoleculerError(
          'Resolved DID document does not match DID',
          400,
          'ATPROTO_DID_DOCUMENT_MISMATCH'
        );
      }

      const alsoKnownAs = Array.isArray(didDocument.alsoKnownAs) ? didDocument.alsoKnownAs : [];
      const expected = `at://${String(handle).trim().toLowerCase()}`;

      if (!alsoKnownAs.some(value => value === expected)) {
        throw new MoleculerError(
          'DID document does not claim handle',
          400,
          'ATPROTO_HANDLE_NOT_CLAIMED'
        );
      }
    },

    assertDidDocumentHasAtprotoKey({ didDocument, did }) {
      const verificationMethods = Array.isArray(didDocument.verificationMethod)
        ? didDocument.verificationMethod
        : [];

      const match = verificationMethods.find(
        item =>
          item &&
          item.id === `${did}#atproto` &&
          item.controller === did &&
          item.type === 'Multikey' &&
          typeof item.publicKeyMultibase === 'string' &&
          item.publicKeyMultibase.length > 0
      );

      if (!match) {
        throw new MoleculerError(
          'DID document missing valid ATProto signing key',
          400,
          'ATPROTO_SIGNING_KEY_MISSING'
        );
      }
    },

    assertDidDocumentPdsMatches({ didDocument, did, pdsUrl }) {
      const services = Array.isArray(didDocument.service) ? didDocument.service : [];
      const service = services.find(
        item =>
          item &&
          (item.id === `${did}#atproto_pds` || item.type === 'AtprotoPersonalDataServer') &&
          typeof item.serviceEndpoint === 'string'
      );

      if (!service) {
        throw new MoleculerError(
          'DID document missing PDS service endpoint',
          400,
          'ATPROTO_PDS_SERVICE_MISSING'
        );
      }

      if (new URL(service.serviceEndpoint).origin !== new URL(pdsUrl).origin) {
        throw new MoleculerError(
          'PDS URL does not match DID document service endpoint',
          400,
          'ATPROTO_PDS_ENDPOINT_MISMATCH'
        );
      }
    }
  }
};
