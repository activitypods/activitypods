module.exports = {
  name: 'internal-identity-projection',

  dependencies: ['identitybindings'],

  actions: {
    getByCanonicalAccountId: {
      params: {
        canonicalAccountId: 'string|min:1'
      },
      async handler(ctx) {
        const binding = await this.lookupBinding(
          ctx,
          'identitybindings.getByCanonicalAccountId',
          {
            canonicalAccountId: String(ctx.params.canonicalAccountId).trim()
          }
        );

        return this.normalize(binding);
      }
    },

    getByDid: {
      params: {
        atprotoDid: 'string|min:1'
      },
      async handler(ctx) {
        const binding = await this.lookupBinding(ctx, 'identitybindings.getByDid', {
          atprotoDid: String(ctx.params.atprotoDid).trim()
        });

        return this.normalize(binding);
      }
    },

    getByHandle: {
      params: {
        atprotoHandle: 'string|min:1'
      },
      async handler(ctx) {
        const binding = await this.lookupBinding(ctx, 'identitybindings.getByHandle', {
          atprotoHandle: String(ctx.params.atprotoHandle).trim().toLowerCase()
        });

        return this.normalize(binding);
      }
    }
  },

  methods: {
    async lookupBinding(ctx, actionName, params) {
      try {
        return await ctx.call(actionName, params);
      } catch (error) {
        if (
          error &&
          (error.code === 404 ||
            error.type === 'NOT_FOUND' ||
            error.type === 'IDENTITY_BINDING_NOT_FOUND')
        ) {
          return null;
        }

        throw error;
      }
    },

    normalize(binding) {
      if (!binding) return null;

      return {
        canonicalAccountId: binding.canonicalAccountId,
        webId: binding.webId,

        activityPubActorId: binding.activityPubActorId || binding.webId || null,
        activityPubHandle: binding.activityPubHandle || null,

        atprotoDid: binding.atprotoDid,
        atprotoHandle: binding.atprotoHandle,
        atprotoSource: binding.atprotoSource || 'local',
        atprotoManaged:
          typeof binding.atprotoManaged === 'boolean' ? binding.atprotoManaged : true,
        atprotoPdsUrl: binding.atprotoPdsUrl || null,
        atSigningKeyRef: binding.atSigningKeyRef,
        atRotationKeyRef: binding.atRotationKeyRef,
        status: this.normalizeStatus(binding.status),

        repo: {
          initialized: Boolean(binding.repoInitialized),
          rootCid: binding.repoRootCid || null,
          rev: binding.repoRev || null
        },

        createdAt: binding.createdAt,
        updatedAt: binding.updatedAt
      };
    },

    normalizeStatus(status) {
      if (status === 'active') return 'active';
      if (status === 'suspended') return 'disabled';
      if (status === 'deactivated') return 'disabled';
      return 'pending';
    }
  }
};
