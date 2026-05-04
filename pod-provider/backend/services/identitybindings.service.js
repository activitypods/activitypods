const crypto = require('crypto');
const urlJoin = require('url-join');
const { ControlledContainerMixin } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { sanitizeSparqlQuery } = require('@semapps/triplestore');
const { MoleculerError } = require('moleculer').Errors;

const APODS = 'http://activitypods.org/ns/core#';

const BINDING_TYPE = 'apods:AtprotoIdentityBinding';
const INDEX_TYPE = 'apods:AtprotoIdentityBindingIndex';
const PREDICATES = {
  canonicalAccountId: `${APODS}canonicalAccountId`,
  webId: `${APODS}webId`,
  activityPubActorId: `${APODS}activityPubActorId`,
  activityPubHandle: `${APODS}activityPubHandle`,
  atprotoDid: `${APODS}atprotoDid`,
  atprotoHandle: `${APODS}atprotoHandle`,
  atprotoSource: `${APODS}atprotoSource`,
  atprotoManaged: `${APODS}atprotoManaged`,
  atprotoPdsUrl: `${APODS}atprotoPdsUrl`,
  atSigningKeyRef: `${APODS}atSigningKeyRef`,
  atRotationKeyRef: `${APODS}atRotationKeyRef`,
  status: `${APODS}status`,
  repoInitialized: `${APODS}repoInitialized`,
  repoRootCid: `${APODS}repoRootCid`,
  repoRev: `${APODS}repoRev`,
  createdAt: `${APODS}createdAt`,
  updatedAt: `${APODS}updatedAt`
};

module.exports = {
  name: 'identitybindings',
  mixins: [ControlledContainerMixin],
  settings: {
    path: '/identity-bindings',
    acceptedTypes: [BINDING_TYPE],
    readOnly: false,
    excludeFromMirror: true,
    activateTombstones: false,
    podProvider: true,
    newResourcesPermissions: {
      anon: {
        read: false
      },
      user: {
        read: false,
        write: false
      }
    }
  },
  actions: {
    getByCanonicalAccountId: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const canonicalAccountId = String(ctx.params.canonicalAccountId).trim();
        const { resourceUri } = await this._resolveBindingLocation(canonicalAccountId, ctx);

        const exists = await ctx.call('ldp.resource.exist', { resourceUri, webId: 'system' });
        if (!exists) return null;

        const resource = await this.actions.get(
          { resourceUri, webId: 'system', accept: MIME_TYPES.JSON },
          { parentCtx: ctx }
        );
        return this._toDto(resource);
      }
    },

    upsert: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 },
        webId: { type: 'string', min: 1 },
        activityPubActorId: { type: 'string', optional: true },
        activityPubHandle: { type: 'string', optional: true },
        atprotoDid: { type: 'string', optional: true },
        atprotoHandle: { type: 'string', optional: true },
        atprotoSource: { type: 'enum', values: ['local', 'external'], optional: true },
        atprotoManaged: { type: 'boolean', optional: true },
        atprotoPdsUrl: { type: 'string', optional: true },
        atSigningKeyRef: { type: 'string', optional: true },
        atRotationKeyRef: { type: 'string', optional: true },
        status: { type: 'string', optional: true },
        repoInitialized: { type: 'boolean', optional: true },
        repoRootCid: { type: 'string', optional: true },
        repoRev: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const {
          canonicalAccountId,
          webId,
          activityPubActorId,
          activityPubHandle,
          atprotoDid,
          atprotoHandle,
          atprotoSource,
          atprotoManaged,
          atprotoPdsUrl,
          atSigningKeyRef,
          atRotationKeyRef,
          status,
          repoInitialized,
          repoRootCid,
          repoRev
        } = ctx.params;

        if (canonicalAccountId !== webId) {
          throw new MoleculerError(
            'canonicalAccountId must equal webId in the current implementation phase',
            400,
            'CANONICAL_ACCOUNT_ID_WEBID_MISMATCH'
          );
        }

        const now = new Date().toISOString();
        const { bindingWebId, slug, resourceUri } = await this._resolveBindingLocation(canonicalAccountId, ctx);

        const exists = await ctx.call('ldp.resource.exist', { resourceUri, webId: 'system' });
        const existing = exists
          ? await this.actions.get({ resourceUri, webId: 'system', accept: MIME_TYPES.JSON }, { parentCtx: ctx })
          : null;

        const existingValue = key => (existing ? this._readField(existing, key) : null);
        const existingBoolean = key => this._coerceBoolean(existingValue(key));

        const resolvedAtprotoSource = atprotoSource || existingValue('atprotoSource') || 'local';

        const resolvedAtprotoManaged =
          typeof atprotoManaged === 'boolean'
            ? atprotoManaged
            : existingBoolean('atprotoManaged') ?? resolvedAtprotoSource !== 'external';

        const resolvedRepoInitialized =
          typeof repoInitialized === 'boolean' ? repoInitialized : existingBoolean('repoInitialized') ?? false;

        const resource = this._compactNulls({
          '@id': resourceUri,
          '@type': [BINDING_TYPE],
          [PREDICATES.canonicalAccountId]: canonicalAccountId,
          [PREDICATES.webId]: webId,
          [PREDICATES.activityPubActorId]: activityPubActorId || existingValue('activityPubActorId') || webId,
          [PREDICATES.activityPubHandle]: activityPubHandle || existingValue('activityPubHandle') || null,
          [PREDICATES.atprotoDid]: atprotoDid || existingValue('atprotoDid'),
          [PREDICATES.atprotoHandle]: atprotoHandle || existingValue('atprotoHandle'),
          [PREDICATES.atprotoSource]: resolvedAtprotoSource,
          [PREDICATES.atprotoManaged]: resolvedAtprotoManaged,
          [PREDICATES.atprotoPdsUrl]: atprotoPdsUrl || existingValue('atprotoPdsUrl') || null,
          [PREDICATES.atSigningKeyRef]: atSigningKeyRef || existingValue('atSigningKeyRef'),
          [PREDICATES.atRotationKeyRef]: atRotationKeyRef || existingValue('atRotationKeyRef'),
          [PREDICATES.status]: status || existingValue('status') || 'pending',
          [PREDICATES.repoInitialized]: resolvedRepoInitialized,
          [PREDICATES.repoRootCid]: repoRootCid || existingValue('repoRootCid') || null,
          [PREDICATES.repoRev]: repoRev || existingValue('repoRev') || null,
          [PREDICATES.createdAt]: existingValue('createdAt') || now,
          [PREDICATES.updatedAt]: now
        });

        if (exists) {
          await this.actions.put(
            {
              resourceUri,
              resource,
              contentType: MIME_TYPES.JSON,
              webId: 'system'
            },
            { parentCtx: ctx }
          );
        } else {
          await this.actions.post(
            {
              webId: bindingWebId,
              slug,
              resource,
              contentType: MIME_TYPES.JSON
            },
            { parentCtx: ctx }
          );
        }

        const saved = await this.actions.get(
          { resourceUri, webId: 'system', accept: MIME_TYPES.JSON },
          { parentCtx: ctx }
        );
        const dto = this._toDto(saved);
        await this._syncBindingIndex(ctx, dto);
        return dto;
      }
    },

    upsertRepoBootstrap: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 },
        did: { type: 'string', min: 1 },
        handle: { type: 'string', min: 1 },
        repoInitialized: { type: 'boolean' },
        rootCid: { type: 'string', min: 1 },
        rev: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const existing = await ctx.call('identitybindings.getByCanonicalAccountId', {
          canonicalAccountId: ctx.params.canonicalAccountId
        });

        if (!existing) {
          throw new MoleculerError(
            'Cannot attach repo bootstrap to missing identity binding',
            404,
            'IDENTITY_BINDING_NOT_FOUND'
          );
        }

        if (existing.atprotoDid && existing.atprotoDid !== ctx.params.did) {
          throw new MoleculerError('Repo bootstrap DID mismatch', 400, 'ATPROTO_DID_MISMATCH');
        }

        if (existing.atprotoHandle && existing.atprotoHandle !== ctx.params.handle) {
          throw new MoleculerError('Repo bootstrap handle mismatch', 400, 'ATPROTO_HANDLE_MISMATCH');
        }

        return ctx.call(
          'identitybindings.upsert',
          {
            canonicalAccountId: existing.canonicalAccountId,
            webId: existing.webId,
            activityPubActorId: existing.activityPubActorId,
            activityPubHandle: existing.activityPubHandle,
            atprotoDid: existing.atprotoDid || ctx.params.did,
            atprotoHandle: existing.atprotoHandle || ctx.params.handle,
            atprotoSource: existing.atprotoSource,
            atprotoManaged: existing.atprotoManaged,
            atprotoPdsUrl: existing.atprotoPdsUrl,
            atSigningKeyRef: existing.atSigningKeyRef,
            atRotationKeyRef: existing.atRotationKeyRef,
            status: existing.status || 'active',
            repoInitialized: ctx.params.repoInitialized,
            repoRootCid: ctx.params.rootCid,
            repoRev: ctx.params.rev
          },
          { parentCtx: ctx }
        );
      }
    },

    getByDid: {
      params: {
        atprotoDid: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const binding = await this._findByDidWithSparql(ctx, String(ctx.params.atprotoDid).trim());
        if (binding) return binding;
        return this._findByBindingField(ctx, 'atprotoDid', String(ctx.params.atprotoDid).trim());
      }
    },

    getByHandle: {
      params: {
        atprotoHandle: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const handle = String(ctx.params.atprotoHandle).trim().toLowerCase();
        const binding = await this._findByHandleWithSparql(ctx, handle);
        if (binding) return binding;
        return this._findByBindingField(ctx, 'atprotoHandle', handle);
      }
    },

    list: {
      params: {
        since: { type: 'string', optional: true },
        limit: { type: 'number', integer: true, positive: true, optional: true, convert: true }
      },
      async handler(ctx) {
        return this._listBindingsWithSparql(ctx, {
          since: ctx.params.since || null,
          limit: ctx.params.limit || 100
        });
      }
    },

    /**
     * Remove an identity binding (LDP resource + SPARQL index entry).
     * Idempotent: returns { removed:false } if no binding exists.
     * Used by signup rollback paths to avoid orphaned bindings on failure.
     */
    remove: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const canonicalAccountId = String(ctx.params.canonicalAccountId).trim();
        const { resourceUri } = await this._resolveBindingLocation(canonicalAccountId, ctx);

        const exists = await ctx.call('ldp.resource.exist', { resourceUri, webId: 'system' });
        if (!exists) {
          // Still attempt index cleanup in case of partial state.
          await this._removeBindingIndex(ctx, canonicalAccountId).catch(() => {});
          return { removed: false, canonicalAccountId };
        }

        await this.actions.delete({ resourceUri, webId: 'system' }, { parentCtx: ctx });
        await this._removeBindingIndex(ctx, canonicalAccountId).catch(err => {
          // Index cleanup is best-effort; LDP resource is the source of truth.
          this.logger.warn(`[identitybindings] index cleanup failed for ${canonicalAccountId}: ${err.message}`);
        });
        return { removed: true, canonicalAccountId };
      }
    }
  },
  methods: {
    async _resolveBindingLocation(canonicalAccountId, ctx) {
      const bindingWebId = canonicalAccountId;
      const containerUri = await this.actions.getContainerUri({ webId: bindingWebId }, { parentCtx: ctx });
      const slug = this._bindingSlug(canonicalAccountId);
      const resourceUri = urlJoin(containerUri, slug);
      return { bindingWebId, containerUri, slug, resourceUri };
    },

    _bindingSlug(canonicalAccountId) {
      const digest = crypto.createHash('sha256').update(canonicalAccountId).digest('hex').slice(0, 24);
      return `atproto-${digest}`;
    },

    _bindingIndexUri(canonicalAccountId) {
      const digest = crypto.createHash('sha256').update(canonicalAccountId).digest('hex').slice(0, 24);
      return `urn:identitybindingindex:${digest}`;
    },

    _toDto(resource) {
      if (!resource) return null;

      const get = key => this._readField(resource, key);

      return {
        id: resource.id || resource['@id'],
        canonicalAccountId: get('canonicalAccountId') || null,
        webId: get('webId') || null,
        activityPubActorId: get('activityPubActorId') || get('webId') || null,
        activityPubHandle: get('activityPubHandle') || null,
        atprotoDid: get('atprotoDid') || null,
        atprotoHandle: get('atprotoHandle') || null,
        atprotoSource: get('atprotoSource') || 'local',
        atprotoManaged: this._coerceBoolean(get('atprotoManaged')) ?? true,
        atprotoPdsUrl: get('atprotoPdsUrl') || null,
        atSigningKeyRef: get('atSigningKeyRef') || null,
        atRotationKeyRef: get('atRotationKeyRef') || null,
        status: get('status') || null,
        repoInitialized: this._coerceBoolean(get('repoInitialized')) ?? false,
        repoRootCid: get('repoRootCid') || null,
        repoRev: get('repoRev') || null,
        createdAt: get('createdAt') || null,
        updatedAt: get('updatedAt') || null
      };
    },

    _readField(resource, key) {
      return this._unwrapFieldValue(resource[key] ?? resource[`apods:${key}`] ?? resource[PREDICATES[key]]);
    },

    _unwrapFieldValue(value) {
      if (Array.isArray(value)) {
        if (value.length === 0) return null;
        return this._unwrapFieldValue(value[0]);
      }

      if (value && typeof value === 'object') {
        if (Object.prototype.hasOwnProperty.call(value, '@value')) {
          return this._unwrapFieldValue(value['@value']);
        }
        if (Object.prototype.hasOwnProperty.call(value, 'value')) {
          return this._unwrapFieldValue(value.value);
        }
        if (Object.prototype.hasOwnProperty.call(value, '@id')) {
          return this._unwrapFieldValue(value['@id']);
        }
      }

      return value;
    },

    _coerceBoolean(value) {
      if (typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true' || normalized === '1') return true;
        if (normalized === 'false' || normalized === '0') return false;
      }
      if (value === 1) return true;
      if (value === 0) return false;
      return null;
    },

    async _findByDidWithSparql(ctx, atprotoDid) {
      try {
        const bindings = await this._queryBindingsWithSparql(ctx);
        const match = bindings.find(binding => binding?.atprotoDid === String(atprotoDid)) || null;
        if (match) return match;
      } catch (err) {
        this.logger.debug('Optimized DID lookup failed', { atprotoDid, error: err.message });
      }
      return null;
    },

    _sparqlLiteral(value) {
      if (value === null || value === undefined) return null;
      return JSON.stringify(String(value));
    },

    async _syncBindingIndex(ctx, binding) {
      if (!binding?.canonicalAccountId) return;

      const indexUri = this._bindingIndexUri(binding.canonicalAccountId);
      const triples = [
        `<${indexUri}> a ${INDEX_TYPE} ;`,
        `  apods:canonicalAccountId ${this._sparqlLiteral(binding.canonicalAccountId)} ;`,
        `  apods:webId ${this._sparqlLiteral(binding.webId || binding.canonicalAccountId)} ;`,
        `  apods:activityPubActorId ${this._sparqlLiteral(binding.activityPubActorId || binding.webId || binding.canonicalAccountId)} ;`,
        `  apods:repoInitialized ${this._sparqlLiteral(binding.repoInitialized ? 'true' : 'false')} ;`,
        `  apods:updatedAt ${this._sparqlLiteral(binding.updatedAt || new Date().toISOString())} ;`,
        `  apods:createdAt ${this._sparqlLiteral(binding.createdAt || new Date().toISOString())}`
      ];

      const optionalTriples = [
        ['activityPubHandle', binding.activityPubHandle],
        ['atprotoDid', binding.atprotoDid],
        ['atprotoHandle', binding.atprotoHandle],
        ['atprotoSource', binding.atprotoSource],
        ['atprotoManaged', typeof binding.atprotoManaged === 'boolean' ? String(binding.atprotoManaged) : null],
        ['atprotoPdsUrl', binding.atprotoPdsUrl],
        ['atSigningKeyRef', binding.atSigningKeyRef],
        ['atRotationKeyRef', binding.atRotationKeyRef],
        ['status', binding.status],
        ['repoRootCid', binding.repoRootCid],
        ['repoRev', binding.repoRev]
      ];

      for (const [predicate, value] of optionalTriples) {
        const literal = this._sparqlLiteral(value);
        if (literal) {
          triples.splice(triples.length - 1, 0, `  apods:${predicate} ${literal} ;`);
        }
      }

      const insertBody = `${triples.join('\n')}\n.`;

      await ctx.call('triplestore.update', {
        query: `
          PREFIX apods: <${APODS}>
          DELETE {
            <${indexUri}> ?p ?o .
          }
          INSERT {
${insertBody}
          }
          WHERE {
            OPTIONAL { <${indexUri}> ?p ?o . }
          }
        `,
        dataset: 'settings',
        webId: 'system'
      });
    },

    async _removeBindingIndex(ctx, canonicalAccountId) {
      if (!canonicalAccountId) return;
      const indexUri = this._bindingIndexUri(canonicalAccountId);
      await ctx.call('triplestore.update', {
        query: `
          DELETE { <${indexUri}> ?p ?o . }
          WHERE  { <${indexUri}> ?p ?o . }
        `,
        dataset: 'settings',
        webId: 'system'
      });
    },

    async _findByHandleWithSparql(ctx, atprotoHandle) {
      try {
        const handleLower = String(atprotoHandle).toLowerCase();
        const bindings = await this._queryBindingsWithSparql(ctx);
        const match =
          bindings.find(binding => String(binding?.atprotoHandle || '').toLowerCase() === handleLower) || null;
        if (match) return match;
      } catch (err) {
        this.logger.debug('Optimized handle lookup failed', { atprotoHandle, error: err.message });
      }
      return null;
    },

    async _findByBindingField(ctx, field, expectedValue) {
      const webIds = await this._listAccountWebIds(ctx);
      for (const webId of webIds) {
        if (!webId) continue;

        const canonicalCandidates = this._canonicalCandidatesFromWebId(webId);
        for (const canonicalAccountId of canonicalCandidates) {
          const binding = await ctx.call(
            'identitybindings.getByCanonicalAccountId',
            { canonicalAccountId },
            { parentCtx: ctx }
          );

          if (!binding?.[field]) continue;

          const actualValue = field === 'atprotoHandle' ? String(binding[field]).toLowerCase() : String(binding[field]);

          if (actualValue === expectedValue) {
            return binding;
          }
        }
      }

      return null;
    },

    async _listAccountWebIds(ctx) {
      try {
        const results = await ctx.call('triplestore.query', {
          query: `
            PREFIX semapps: <http://semapps.org/ns/core#>
            SELECT DISTINCT ?webId
            WHERE {
              ?account semapps:webId ?webId .
            }
          `,
          dataset: 'settings',
          webId: 'system'
        });

        return (results || [])
          .map(row => this._readQueryBinding(row, 'webId'))
          .filter(value => typeof value === 'string' && value.length > 0);
      } catch (err) {
        this.logger.debug('Account webId enumeration via settings dataset failed', {
          error: err.message
        });
      }

      const rawAccounts = await ctx.call('auth.account.find', {
        query: {},
        pagination: false,
        pageSize: 10000
      });

      const accounts = this._normalizeAccountResults(rawAccounts);
      return (accounts || [])
        .map(account => (typeof account?.webId === 'string' ? account.webId : null))
        .filter(Boolean);
    },

    _normalizeAccountResults(rawAccounts) {
      if (Array.isArray(rawAccounts)) return rawAccounts;
      if (Array.isArray(rawAccounts?.rows)) return rawAccounts.rows;
      if (Array.isArray(rawAccounts?.['hydra:member'])) return rawAccounts['hydra:member'];
      return [];
    },

    _canonicalCandidatesFromWebId(webId) {
      const candidates = new Set([webId]);
      candidates.add(webId.replace(/\/profile\/card#me$/, ''));
      candidates.add(webId.replace(/#me$/, ''));
      candidates.add(webId.replace(/\/?profile\/card#me$/, ''));
      return Array.from(candidates).filter(Boolean);
    },

    _readQueryBinding(row, key) {
      const value = row?.[key];
      if (typeof value === 'string' || typeof value === 'boolean') return value;
      if (value && typeof value === 'object' && typeof value.value === 'string') {
        return value.value;
      }
      return null;
    },

    _compactNulls(objectValue) {
      return Object.fromEntries(
        Object.entries(objectValue).filter(([, value]) => value !== null && value !== undefined)
      );
    },

    _parseCursor(cursor) {
      if (!cursor) return null;

      try {
        const parsed = JSON.parse(Buffer.from(String(cursor), 'base64url').toString('utf8'));
        if (
          typeof parsed?.updatedAt !== 'string' ||
          parsed.updatedAt.length === 0 ||
          typeof parsed?.canonicalAccountId !== 'string' ||
          parsed.canonicalAccountId.length === 0
        ) {
          throw new Error('invalid');
        }
        return parsed;
      } catch (_err) {
        throw new MoleculerError('Invalid cursor', 400, 'INVALID_CURSOR');
      }
    },

    _encodeCursor(entry) {
      return Buffer.from(
        JSON.stringify({
          updatedAt: entry.updatedAt,
          canonicalAccountId: entry.canonicalAccountId
        }),
        'utf8'
      ).toString('base64url');
    },

    async _queryBindingsWithSparql(ctx) {
      const results = await ctx.call('triplestore.query', {
        query: sanitizeSparqlQuery`
            PREFIX apods: <${APODS}>
            SELECT ?binding ?canonicalAccountId ?webId ?activityPubActorId ?activityPubHandle
                   ?atprotoDid ?atprotoHandle ?atprotoSource ?atprotoManaged ?atprotoPdsUrl
                   ?atSigningKeyRef ?atRotationKeyRef ?status
                   ?repoInitialized ?repoRootCid ?repoRev ?createdAt ?updatedAt
            WHERE {
              ?binding a apods:AtprotoIdentityBindingIndex .
              OPTIONAL { ?binding apods:canonicalAccountId ?canonicalAccountId . }
              OPTIONAL { ?binding apods:webId ?webId . }
              OPTIONAL { ?binding apods:activityPubActorId ?activityPubActorId . }
              OPTIONAL { ?binding apods:activityPubHandle ?activityPubHandle . }
              OPTIONAL { ?binding apods:atprotoDid ?atprotoDid . }
              OPTIONAL { ?binding apods:atprotoHandle ?atprotoHandle . }
              OPTIONAL { ?binding apods:atprotoSource ?atprotoSource . }
              OPTIONAL { ?binding apods:atprotoManaged ?atprotoManaged . }
              OPTIONAL { ?binding apods:atprotoPdsUrl ?atprotoPdsUrl . }
              OPTIONAL { ?binding apods:atSigningKeyRef ?atSigningKeyRef . }
              OPTIONAL { ?binding apods:atRotationKeyRef ?atRotationKeyRef . }
              OPTIONAL { ?binding apods:status ?status . }
              OPTIONAL { ?binding apods:repoInitialized ?repoInitialized . }
              OPTIONAL { ?binding apods:repoRootCid ?repoRootCid . }
              OPTIONAL { ?binding apods:repoRev ?repoRev . }
              OPTIONAL { ?binding apods:createdAt ?createdAt . }
              OPTIONAL { ?binding apods:updatedAt ?updatedAt . }
            }
          `,
        dataset: 'settings',
        webId: 'system'
      });

      return (results || []).map(row => ({
        id: this._readQueryBinding(row, 'binding'),
        canonicalAccountId: this._readQueryBinding(row, 'canonicalAccountId'),
        webId: this._readQueryBinding(row, 'webId'),
        activityPubActorId:
          this._readQueryBinding(row, 'activityPubActorId') || this._readQueryBinding(row, 'webId') || null,
        activityPubHandle: this._readQueryBinding(row, 'activityPubHandle'),
        atprotoDid: this._readQueryBinding(row, 'atprotoDid'),
        atprotoHandle: this._readQueryBinding(row, 'atprotoHandle'),
        atprotoSource: this._readQueryBinding(row, 'atprotoSource') || 'local',
        atprotoManaged: this._coerceBoolean(this._readQueryBinding(row, 'atprotoManaged')) ?? true,
        atprotoPdsUrl: this._readQueryBinding(row, 'atprotoPdsUrl'),
        atSigningKeyRef: this._readQueryBinding(row, 'atSigningKeyRef'),
        atRotationKeyRef: this._readQueryBinding(row, 'atRotationKeyRef'),
        status: this._readQueryBinding(row, 'status'),
        repoInitialized: this._coerceBoolean(this._readQueryBinding(row, 'repoInitialized')) ?? false,
        repoRootCid: this._readQueryBinding(row, 'repoRootCid'),
        repoRev: this._readQueryBinding(row, 'repoRev'),
        createdAt: this._readQueryBinding(row, 'createdAt'),
        updatedAt: this._readQueryBinding(row, 'updatedAt')
      }));
    },

    async _listBindingsWithSparql(ctx, { since, limit }) {
      const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
      const cursor = this._parseCursor(since);
      let bindings = [];

      try {
        bindings = await this._queryBindingsWithSparql(ctx);
      } catch (err) {
        this.logger.warn('Optimized identity binding enumeration failed, falling back', {
          error: err.message
        });

        const webIds = await this._listAccountWebIds(ctx);

        for (const webId of webIds) {
          if (!webId) continue;

          try {
            const binding = await ctx.call(
              'identitybindings.getByCanonicalAccountId',
              { canonicalAccountId: webId },
              { parentCtx: ctx }
            );
            if (binding) bindings.push(binding);
          } catch (_err) {
            // Ignore missing or unreadable bindings during enumeration.
          }
        }
      }

      const items = bindings
        .filter(binding => binding?.canonicalAccountId && binding?.updatedAt)
        .sort((a, b) => {
          const updatedAtCompare = String(a.updatedAt).localeCompare(String(b.updatedAt));
          if (updatedAtCompare !== 0) return updatedAtCompare;
          return String(a.canonicalAccountId).localeCompare(String(b.canonicalAccountId));
        })
        .filter(binding => {
          if (!cursor) return true;
          return (
            String(binding.updatedAt) > cursor.updatedAt ||
            (String(binding.updatedAt) === cursor.updatedAt &&
              String(binding.canonicalAccountId) > cursor.canonicalAccountId)
          );
        })
        .slice(0, safeLimit);
      const last = items[items.length - 1];

      return {
        items,
        nextCursor: last ? this._encodeCursor(last) : since || null
      };
    }
  }
};
