module.exports = {
  name: 'internal-identity-changes',

  dependencies: ['identitybindings'],

  actions: {
    listChanges: {
      params: {
        since: { type: 'string', optional: true },
        limit: { type: 'number', integer: true, positive: true, optional: true, convert: true }
      },
      async handler(ctx) {
        const limit = Math.max(1, Math.min(Number(ctx.params.limit) || 100, 500));
        const result = await ctx.call('identitybindings.list', {
          since: ctx.params.since || null,
          limit
        });

        return {
          items: Array.isArray(result?.items)
            ? result.items.map(binding => this.normalize(binding))
            : [],
          nextCursor: typeof result?.nextCursor === 'string' || result?.nextCursor === null
            ? result.nextCursor
            : ctx.params.since || null
        };
      }
    }
  },

  methods: {
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
        createdAt: binding.createdAt || null,
        updatedAt: binding.updatedAt || null
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
