const { MoleculerError } = require('moleculer').Errors;
const { getDatasetFromUri } = require('@semapps/ldp');
const { sanitizeSparqlQuery } = require('@semapps/triplestore');

const JSON_LD = 'application/ld+json';

const ALLOWED = new Set([
  'filters',
  'blocks',
  'mutes',
  'preferences',
  'app-consents'
]);

const CONTEXT = {
  apods: 'https://activitypods.org/ns/core#',
  dc: 'http://purl.org/dc/terms/',
  type: '@type',
  id: '@id',
  pattern: 'apods:pattern',
  action: 'apods:action',
  subjectCanonicalId: 'apods:subjectCanonicalId',
  subjectProtocol: 'apods:subjectProtocol',
  clientId: 'apods:clientId',
  permissions: 'apods:permissions',
  category: 'apods:category',
  value: 'apods:value',
  updatedAt: 'dc:modified',
  createdAt: 'dc:created'
};

const RESOURCE_TYPE_BY_CONTAINER = {
  filters: 'apods:Filter',
  blocks: 'apods:Block',
  mutes: 'apods:Mute',
  preferences: 'apods:Preference',
  'app-consents': 'apods:AppConsent'
};

const RESOURCE_CLASS_URI_BY_CONTAINER = {
  filters: 'https://activitypods.org/ns/core#Filter',
  blocks: 'https://activitypods.org/ns/core#Block',
  mutes: 'https://activitypods.org/ns/core#Mute',
  preferences: 'https://activitypods.org/ns/core#Preference',
  'app-consents': 'https://activitypods.org/ns/core#AppConsent'
};

module.exports = {
  name: 'user-settings-api',
  dependencies: ['api', 'ldp.container', 'ldp.resource'],

  settings: {
    routePath: '/api/dashboard'
  },

  async started() {
    await this.broker.call('api.addRoute', {
      route: {
        path: this.settings.routePath,
        authorization: true,
        authentication: true,
        aliases: {
          'GET /settings/:container': 'user-settings-api.list',
          'POST /settings/:container': 'user-settings-api.create',
          'PUT /settings': 'user-settings-api.update',
          'DELETE /settings': 'user-settings-api.remove',
          'GET /app-consents': 'user-settings-api.listAppConsents',
          'POST /app-consents': 'user-settings-api.createAppConsent'
        }
      }
    });
  },

  actions: {
    async list(ctx) {
      const webId = this.requireWebId(ctx);
      const c = this.requireContainer(ctx.params.container);
      return { data: await this.listByContainer(ctx, webId, c) };
    },

    async create(ctx) {
      const webId = this.requireWebId(ctx);
      const c = this.requireContainer(ctx.params.container);
      const uri = this.dataContainer(webId);

      const now = new Date().toISOString();
      const type = this.resourceTypeForContainer(c);

      const resource = {
        '@context': CONTEXT,
        type,
        createdAt: now,
        updatedAt: now,
        ...(ctx.params.data || {})
      };

      const resourceUri = await ctx.call('ldp.container.post', {
        containerUri: uri,
        resource,
        contentType: JSON_LD,
        webId
      });

      const created = await ctx.call('ldp.resource.get', {
        resourceUri,
        webId,
        accept: JSON_LD,
        jsonContext: CONTEXT
      });

      return { data: created };
    },

    async update(ctx) {
      const webId = this.requireWebId(ctx);
      const { resourceUri, data } = ctx.params;

      const existing = await ctx.call('ldp.resource.get', {
        resourceUri,
        webId,
        accept: JSON_LD,
        jsonContext: CONTEXT
      });

      const next = {
        ...existing,
        ...data,
        updatedAt: new Date().toISOString()
      };

      await ctx.call('ldp.resource.put', {
        resourceUri,
        resource: next,
        contentType: JSON_LD,
        webId
      });

      return { data: next };
    },

    async remove(ctx) {
      const webId = this.requireWebId(ctx);
      const resourceUri = ctx.params.resourceUri || ctx.meta.$query?.resourceUri;

      if (!resourceUri) throw new MoleculerError('resourceUri is required', 400);

      // Ownership guard: resource must live inside the caller's data container
      if (!resourceUri.startsWith(this.dataContainer(webId))) {
        throw new MoleculerError('Forbidden', 403);
      }

      const dataset = getDatasetFromUri(webId);
      await ctx.call('ldp.resource.delete', { resourceUri, webId }, { meta: { dataset } });

      return { deleted: true };
    },

    async listAppConsents(ctx) {
      const webId = this.requireWebId(ctx);
      return { data: await this.listByContainer(ctx, webId, 'app-consents') };
    },

    async createAppConsent(ctx) {
      const webId = this.requireWebId(ctx);
      const uri = this.dataContainer(webId);
      const now = new Date().toISOString();

      const resource = {
        '@context': CONTEXT,
        type: this.resourceTypeForContainer('app-consents'),
        createdAt: now,
        updatedAt: now,
        ...(ctx.params.data || {})
      };

      const resourceUri = await ctx.call('ldp.container.post', {
        containerUri: uri,
        resource,
        contentType: JSON_LD,
        webId
      });

      const created = await ctx.call('ldp.resource.get', {
        resourceUri,
        webId,
        accept: JSON_LD,
        jsonContext: CONTEXT
      });

      return { data: created };
    }
  },

  methods: {
    requireWebId(ctx) {
      const webId = ctx.meta.webId;
      if (!webId || webId === 'anon') throw new MoleculerError('Unauthorized', 401);
      return webId;
    },

    requireContainer(c) {
      if (!ALLOWED.has(c)) throw new MoleculerError('Invalid container', 400);
      return c;
    },

    base(webId) {
      const u = new URL(webId);
      u.hash = '';
      let b = u.toString();
      if (!b.endsWith('/')) b += '/';
      return b;
    },

    dataContainer(webId) {
      return `${this.base(webId)}data/`;
    },

    resourceTypeForContainer(container) {
      return RESOURCE_TYPE_BY_CONTAINER[container];
    },

    normalizeType(value) {
      if (!value) return null;
      if (Array.isArray(value)) return this.normalizeType(value[0]);
      return String(value);
    },

    async listByContainer(ctx, webId, container) {
      const resourceClassUri = RESOURCE_CLASS_URI_BY_CONTAINER[container];
      const dataset = getDatasetFromUri(webId);
      const dataBase = this.dataContainer(webId);

      const rows = await ctx.call('triplestore.query', {
        query: sanitizeSparqlQuery`
          SELECT DISTINCT ?resource
          WHERE {
            ?resource a <${resourceClassUri}> .
            FILTER(STRSTARTS(STR(?resource), "${dataBase}"))
          }
          ORDER BY DESC(?resource)
        `,
        dataset,
        webId: 'system'
      });

      const uris = rows
        .map(row => row?.resource?.value)
        .filter(Boolean);

      const resources = await Promise.all(
        uris.map(async resourceUri => {
          try {
            return await ctx.call('ldp.resource.get', {
              resourceUri,
              webId,
              accept: JSON_LD,
              jsonContext: CONTEXT
            });
          } catch {
            return null;
          }
        })
      );

      return resources.filter(Boolean);
    },

    async ensure(ctx, webId, c) {
      const root = `${this.base(webId)}settings/`;
      await this.ensureOne(ctx, root, webId, 'Settings');

      const sub = `${root}${c}/`;
      await this.ensureOne(ctx, sub, webId, c);

      return sub;
    },

    async ensureOne(ctx, uri, webId, title) {
      try {
        await ctx.call('ldp.container.create', { containerUri: uri, title, webId });
      } catch (error) {
        if (error?.code !== 400 && error?.code !== 409) {
          throw error;
        }
      }
    }
  }
};