const APODS = 'http://activitypods.org/ns/core#';

module.exports = {
  name: 'internal-identity-projection',
  dependencies: ['identitybindings', 'auth.account'],

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
          atprotoDid: String(ctx.params.atprotoDid)
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
    async _findBindingByField(ctx, field, expectedValue) {
      const rawAccounts = await ctx.call(
        'auth.account.find',
        {},
        { parentCtx: ctx, meta: { webId: 'system' } }
      );

      const accounts = this._normalizeAccountResults(rawAccounts);

      // Deterministic path: query each account dataset directly for matching DID/handle.
      for (const account of accounts) {
        const username = typeof account?.username === 'string' ? account.username : null;
        if (!username) continue;

        const bindingFromDataset = await this._findBindingInDatasetByField(
          ctx,
          username,
          field,
          expectedValue
        );
        if (bindingFromDataset) return bindingFromDataset;
      }

      // Fallback path: try known canonical candidates derived from account records.
      for (const account of accounts) {
        const webId = typeof account?.webId === 'string' ? account.webId : null;
        if (!webId) continue;

        let binding = null;
        for (const canonicalAccountId of this._canonicalCandidatesFromAccount(account)) {
          binding = await ctx.call('identitybindings.getByCanonicalAccountId', {
            canonicalAccountId
          });
          if (binding) break;
        }
        if (!binding) continue;

        const actual = binding[field];
        if (!actual) continue;

        if (field === 'atprotoHandle') {
          if (String(actual).toLowerCase() === String(expectedValue).toLowerCase()) {
            return binding;
          }
        } else if (String(actual) === String(expectedValue)) {
          return binding;
        }
      }

      return null;
    },

    async _findBindingInDatasetByField(ctx, username, field, expectedValue) {
      const predicate = field === 'atprotoHandle' ? 'atprotoHandle' : 'atprotoDid';
      const escapedExpected = String(expectedValue)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');

      const filter = field === 'atprotoHandle'
        ? `FILTER(LCASE(STR(?value)) = LCASE("${escapedExpected}"))`
        : `FILTER(STR(?value) = "${escapedExpected}")`;

      const query = `
        PREFIX apods: <${APODS}>
        SELECT ?canonicalAccountId ?webId ?atprotoDid ?atprotoHandle ?atSigningKeyRef ?atRotationKeyRef ?status ?createdAt ?updatedAt
        WHERE {
          ?binding a apods:AtprotoIdentityBinding .
          ?binding apods:canonicalAccountId ?canonicalAccountId .
          ?binding apods:webId ?webId .
          ?binding apods:${predicate} ?value .
          OPTIONAL { ?binding apods:atprotoDid ?atprotoDid . }
          OPTIONAL { ?binding apods:atprotoHandle ?atprotoHandle . }
          OPTIONAL { ?binding apods:atSigningKeyRef ?atSigningKeyRef . }
          OPTIONAL { ?binding apods:atRotationKeyRef ?atRotationKeyRef . }
          OPTIONAL { ?binding apods:status ?status . }
          OPTIONAL { ?binding apods:createdAt ?createdAt . }
          OPTIONAL { ?binding apods:updatedAt ?updatedAt . }
          ${filter}
        }
        LIMIT 1
      `;

      try {
        const rows = await ctx.call('triplestore.query', {
          query,
          dataset: username,
          webId: 'system'
        });

        const row = rows?.[0];
        if (!row) return null;

        return {
          canonicalAccountId: row.canonicalAccountId?.value || null,
          webId: row.webId?.value || null,
          atprotoDid: row.atprotoDid?.value || null,
          atprotoHandle: row.atprotoHandle?.value || null,
          atSigningKeyRef: row.atSigningKeyRef?.value || null,
          atRotationKeyRef: row.atRotationKeyRef?.value || null,
          status: row.status?.value || null,
          createdAt: row.createdAt?.value || null,
          updatedAt: row.updatedAt?.value || null
        };
      } catch (_err) {
        return null;
      }
    },

    _normalizeAccountResults(rawAccounts) {
      if (Array.isArray(rawAccounts)) return rawAccounts;
      if (Array.isArray(rawAccounts?.rows)) return rawAccounts.rows;
      if (Array.isArray(rawAccounts?.['hydra:member'])) return rawAccounts['hydra:member'];
      return [];
    },

    _canonicalCandidatesFromAccount(account) {
      const webId = typeof account?.webId === 'string' ? account.webId : '';
      const username = typeof account?.username === 'string' ? account.username : '';

      const candidates = new Set([webId]);
      candidates.add(webId.replace(/\/profile\/card#me$/, ''));
      candidates.add(webId.replace(/#me$/, ''));
      candidates.add(webId.replace(/\/?profile\/card#me$/, ''));

      if (username) {
        try {
          const origin = new URL(webId).origin;
          candidates.add(`${origin}/${username}`);
        } catch (_err) {
          // Ignore malformed WebID candidate.
        }
      }

      return Array.from(candidates).filter(Boolean);
    },

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
