module.exports = {
  name: 'internal-identity-projection',
  dependencies: ['identitybindings'],

  actions: {
    getByCanonicalAccountId: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const binding = await ctx.call('identitybindings.getByCanonicalAccountId', {
          canonicalAccountId: ctx.params.canonicalAccountId
        });

        return this._normalize(binding);
      }
    },

    getByDid: {
      params: {
        atprotoDid: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const binding = await ctx.call('identitybindings.getByDid', {
          atprotoDid: ctx.params.atprotoDid
        });

        return this._normalize(binding);
      }
    },

    getByHandle: {
      params: {
        atprotoHandle: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const binding = await ctx.call('identitybindings.getByHandle', {
          atprotoHandle: String(ctx.params.atprotoHandle).toLowerCase()
        });

        return this._normalize(binding);
      }
    }
  },

  methods: {
    _normalize(binding) {
      if (!binding) return null;

      return {
        canonicalAccountId: binding.canonicalAccountId,
        webId: binding.webId,
        activityPubActorId: binding.webId || null,
        activityPubHandle: null,
        atprotoDid: binding.atprotoDid,
        atprotoHandle: binding.atprotoHandle,
        atSigningKeyRef: binding.atSigningKeyRef,
        atRotationKeyRef: binding.atRotationKeyRef,
        status: this._normalizeStatus(binding.status),
        createdAt: binding.createdAt,
        updatedAt: binding.updatedAt
      };
    },

    _normalizeStatus(status) {
      if (status === 'active') return 'active';
      if (status === 'suspended') return 'disabled';
      if (status === 'deactivated') return 'disabled';
      return 'pending';
    }
  }
};
