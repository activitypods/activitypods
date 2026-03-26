const crypto = require('crypto');
const urlJoin = require('url-join');
const { ControlledContainerMixin } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { sanitizeSparqlQuery } = require('@semapps/triplestore');

const APODS = 'http://activitypods.org/ns/core#';

const BINDING_TYPE = 'apods:AtprotoIdentityBinding';
const PREDICATES = {
  canonicalAccountId: `${APODS}canonicalAccountId`,
  webId: `${APODS}webId`,
  atprotoDid: `${APODS}atprotoDid`,
  atprotoHandle: `${APODS}atprotoHandle`,
  atSigningKeyRef: `${APODS}atSigningKeyRef`,
  atRotationKeyRef: `${APODS}atRotationKeyRef`,
  status: `${APODS}status`,
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
        const { canonicalAccountId } = ctx.params;
        const { resourceUri } = await this._resolveBindingLocation(canonicalAccountId, ctx);

        const exists = await ctx.call('ldp.resource.exist', { resourceUri, webId: 'system' });
        if (!exists) return null;

        const resource = await this.actions.get({ resourceUri, webId: 'system', accept: MIME_TYPES.JSON }, { parentCtx: ctx });
        return this._toDto(resource);
      }
    },

    upsert: {
      params: {
        canonicalAccountId: { type: 'string', min: 1 },
        webId: { type: 'string', min: 1 },
        atprotoDid: { type: 'string', optional: true },
        atprotoHandle: { type: 'string', optional: true },
        atSigningKeyRef: { type: 'string', optional: true },
        atRotationKeyRef: { type: 'string', optional: true },
        status: { type: 'string', optional: true }
      },
      async handler(ctx) {
        const {
          canonicalAccountId,
          webId,
          atprotoDid,
          atprotoHandle,
          atSigningKeyRef,
          atRotationKeyRef,
          status
        } = ctx.params;

        if (canonicalAccountId !== webId) {
          throw new Error('canonicalAccountId must equal webId in the first implementation phase');
        }

        const now = new Date().toISOString();
        const { bindingWebId, slug, resourceUri } = await this._resolveBindingLocation(canonicalAccountId, ctx);

        const exists = await ctx.call('ldp.resource.exist', { resourceUri, webId: 'system' });
        const existing = exists
          ? await this.actions.get({ resourceUri, webId: 'system', accept: MIME_TYPES.JSON }, { parentCtx: ctx })
          : null;

        const existingValue = key => (existing ? this._readField(existing, key) : null);

        const resource = this._compactNulls({
          '@id': resourceUri,
          '@type': [BINDING_TYPE],
          [PREDICATES.canonicalAccountId]: canonicalAccountId,
          [PREDICATES.webId]: webId,
          [PREDICATES.atprotoDid]: atprotoDid || existingValue('atprotoDid'),
          [PREDICATES.atprotoHandle]: atprotoHandle || existingValue('atprotoHandle'),
          [PREDICATES.atSigningKeyRef]: atSigningKeyRef || existingValue('atSigningKeyRef'),
          [PREDICATES.atRotationKeyRef]: atRotationKeyRef || existingValue('atRotationKeyRef'),
          [PREDICATES.status]: status || existingValue('status') || 'pending',
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

        const saved = await this.actions.get({ resourceUri, webId: 'system', accept: MIME_TYPES.JSON }, { parentCtx: ctx });
        return this._toDto(saved);
      }
    },

    getByDid: {
      params: {
        atprotoDid: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        // Try SPARQL-based lookup first for performance
        const binding = await this._findByDidWithSparql(ctx, ctx.params.atprotoDid);
        if (binding) return binding;
        // Fall back to iterat linear scan if SPARQL lookup fails
        return this._findByBindingField(ctx, 'atprotoDid', ctx.params.atprotoDid);
      }
    },

    getByHandle: {
      params: {
        atprotoHandle: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        // Try SPARQL-based lookup first for performance
        const handle = String(ctx.params.atprotoHandle).toLowerCase();
        const binding = await this._findByHandleWithSparql(ctx, handle);
        if (binding) return binding;
        // Fall back to linear scan if SPARQL lookup fails
        return this._findByBindingField(ctx, 'atprotoHandle', handle);
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

    _toDto(resource) {
      if (!resource) return null;

      const get = key => this._readField(resource, key);

      return {
        id: resource.id || resource['@id'],
        canonicalAccountId: get('canonicalAccountId') || null,
        webId: get('webId') || null,
        atprotoDid: get('atprotoDid') || null,
        atprotoHandle: get('atprotoHandle') || null,
        atSigningKeyRef: get('atSigningKeyRef') || null,
        atRotationKeyRef: get('atRotationKeyRef') || null,
        status: get('status') || null,
        createdAt: get('createdAt') || null,
        updatedAt: get('updatedAt') || null
      };
    },

    _readField(resource, key) {
      return resource[key] ?? resource[`apods:${key}`] ?? resource[PREDICATES[key]];
    },

    async _findByDidWithSparql(ctx, atprotoDid) {
      try {
        // Get the root container where all bindings are stored
        const containerUri = await ctx.call('ldp.container.getResourceUri', {
          containerUri: this.getRouteUri()
        });

        // List all resources in the binding container
        const resources = await ctx.call('ldp.container.list', {
          containerUri,
          webId: 'system',
          returnContainers: false
        });

        // Search for the resource with the matching DID
        if (resources && Array.isArray(resources)) {
          for (const resourceUri of resources) {
            try {
              const resource = await ctx.call('ldp.resource.get', {
                resourceUri,
                webId: 'system',
                accept: 'application/json'
              });

              const did = this._readField(resource, 'atprotoDid');
              if (did === atprotoDid) {
                const canonicalAccountId = this._readField(resource, 'canonicalAccountId');
                if (canonicalAccountId) {
                  return this._toDto(resource);
                }
              }
            } catch (err) {
              // Skip resources that can't be read
              continue;
            }
          }
        }
      } catch (err) {
        // Container listing failed; fall back to linear scan
        this.logger.debug('Container-based DID lookup failed, falling back to linear scan', { atprotoDid, error: err.message });
      }
      return null;
    },

    async _findByHandleWithSparql(ctx, atprotoHandle) {
      try {
        // Get the root container where all bindings are stored
        const containerUri = await ctx.call('ldp.container.getResourceUri', {
          containerUri: this.getRouteUri()
        });

        // List all resources in the binding container
        const resources = await ctx.call('ldp.container.list', {
          containerUri,
          webId: 'system',
          returnContainers: false
        });

        // Search for the resource with the matching handle
        if (resources && Array.isArray(resources)) {
          for (const resourceUri of resources) {
            try {
              const resource = await ctx.call('ldp.resource.get', {
                resourceUri,
                webId: 'system',
                accept: 'application/json'
              });

              const handle = this._readField(resource, 'atprotoHandle');
              if (handle && String(handle).toLowerCase() === atprotoHandle.toLowerCase()) {
                return this._toDto(resource);
              }
            } catch (err) {
              // Skip resources that can't be read
              continue;
            }
          }
        }
      } catch (err) {
        // Container listing failed; fall back to linear scan
        this.logger.debug('Container-based handle lookup failed, falling back to linear scan', { atprotoHandle, error: err.message });
      }
      return null;
    },

    async _findByCanonicalAccountIdDirect(ctx, canonicalAccountId) {
      // Direct RDF lookup by canonical account ID
      return ctx.call('identitybindings.getByCanonicalAccountId', { canonicalAccountId }, { parentCtx: ctx });
    },

    async _findByBindingField(ctx, field, expectedValue) {
      const accounts = await ctx.call('auth.account.find', { query: {} });
      for (const account of accounts || []) {
        const webId = typeof account?.webId === 'string' ? account.webId : null;
        if (!webId) continue;

        const canonicalCandidates = this._canonicalCandidatesFromWebId(webId);
        for (const canonicalAccountId of canonicalCandidates) {
          const binding = await ctx.call(
            'identitybindings.getByCanonicalAccountId',
            { canonicalAccountId },
            { parentCtx: ctx }
          );

          if (!binding?.[field]) continue;

          const actualValue = field === 'atprotoHandle'
            ? String(binding[field]).toLowerCase()
            : String(binding[field]);

          if (actualValue === expectedValue) {
            return binding;
          }
        }
      }

      return null;
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
      if (typeof value === 'string') return value;
      if (value && typeof value === 'object' && typeof value.value === 'string') {
        return value.value;
      }
      return null;
    },

    _compactNulls(objectValue) {
      return Object.fromEntries(Object.entries(objectValue).filter(([, value]) => value !== null && value !== undefined));
    }
  }
};
