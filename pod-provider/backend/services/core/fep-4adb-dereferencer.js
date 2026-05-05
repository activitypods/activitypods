const fetch = require('node-fetch');
const { isBaredomain } = require('./fep-612d-dns-resolver');

const JSON_LD = 'application/ld+json';
const ACTIVITY_STREAMS_CONTEXT = 'https://www.w3.org/ns/activitystreams';
const XRD_CONTEXT = {
  xrd: 'http://docs.oasis-open.org/ns/xri/xrd-1.0#',
  aliases: {
    '@id': 'xrd:Alias',
    '@type': '@id',
    '@container': '@set'
  }
};

module.exports = {
  name: 'fep-4adb-dereferencer',
  dependencies: ['webfinger', 'activitypub.actor', 'auth.account', 'ldp.resource', 'fep-612d-dns-resolver'],

  settings: {
    baseUrl: process.env.SEMAPPS_HOME_URL || '',
    requestTimeoutMs: 5000
  },

  actions: {
    async dereferenceIdentifier(ctx) {
      const { identifier, contextDomain } = ctx.params;

      if (!identifier || typeof identifier !== 'string') {
        throw new Error('Identifier is required');
      }

      if (identifier.startsWith('http://') || identifier.startsWith('https://')) {
        return ctx.call('activitypub.actor.get', { actorUri: identifier, webId: 'system' });
      }

      // FEP-612d: bare domain names are resolved via DNS _apobjid TXT records.
      if (isBaredomain(identifier)) {
        return ctx.call('fep-612d-dns-resolver.resolveByDomain', { domain: identifier });
      }

      const domain = this.extractDomain(identifier, contextDomain);
      if (!domain) {
        throw new Error(`Cannot determine domain for identifier: ${identifier}`);
      }

      const actorUri = await this.webfingerLookup(ctx, identifier, domain);
      if (!actorUri) {
        throw new Error(`Webfinger lookup failed for identifier: ${identifier}`);
      }

      return ctx.call('activitypub.actor.get', { actorUri, webId: 'system' });
    },

    async addAlias(ctx) {
      const { actorId, alias } = ctx.params;
      if (!actorId || !alias) throw new Error('Actor ID and alias are required');

      const actor = await this.getActor(ctx, actorId);
      const currentAliases = this.getAliases(actor);
      if (currentAliases.includes(alias)) return { success: true, aliases: currentAliases };

      const nextAliases = [...currentAliases, alias];
      const nextActor = {
        ...actor,
        alsoKnownAs: nextAliases,
        aliases: nextAliases,
        '@context': this.ensureXrdContext(actor['@context'])
      };

      await this.persistLocalActor(ctx, actorId, nextActor);
      return { success: true, aliases: nextAliases };
    },

    async removeAlias(ctx) {
      const { actorId, alias } = ctx.params;
      if (!actorId || !alias) throw new Error('Actor ID and alias are required');

      const actor = await this.getActor(ctx, actorId);
      const nextAliases = this.getAliases(actor).filter(a => a !== alias);
      const nextActor = {
        ...actor,
        alsoKnownAs: nextAliases,
        aliases: nextAliases,
        '@context': this.ensureXrdContext(actor['@context'])
      };

      await this.persistLocalActor(ctx, actorId, nextActor);
      return { success: true, aliases: nextAliases };
    },

    async listAliases(ctx) {
      const { actorId } = ctx.params;
      if (!actorId) throw new Error('Actor ID is required');

      const actor = await this.getActor(ctx, actorId);
      return this.getAliases(actor);
    },

    async verifyIdentifier(ctx) {
      const { identifier, actorId, contextDomain } = ctx.params;
      if (!identifier || !actorId) return false;

      try {
        const dereferenced = await ctx.call('fep-4adb-dereferencer.dereferenceIdentifier', {
          identifier,
          contextDomain
        });
        const resolved = this.normalizeUri(dereferenced?.id || dereferenced?.['@id']);
        const expected = this.normalizeUri(actorId);
        return Boolean(resolved && expected && resolved === expected);
      } catch (e) {
        this.logger.warn(`FEP-4adb verification failed for ${identifier}: ${e.message}`);
        return false;
      }
    }
  },

  methods: {
    normalizeUri(uri) {
      if (!uri || typeof uri !== 'string') return null;
      return uri.endsWith('/') ? uri.slice(0, -1) : uri;
    },

    getAliases(actor) {
      const alsoKnownAs = Array.isArray(actor?.alsoKnownAs) ? actor.alsoKnownAs : [];
      const aliases = Array.isArray(actor?.aliases) ? actor.aliases : [];
      return [...new Set([...alsoKnownAs, ...aliases].filter(v => typeof v === 'string'))];
    },

    ensureXrdContext(rawContext) {
      const context = Array.isArray(rawContext) ? [...rawContext] : [rawContext || ACTIVITY_STREAMS_CONTEXT];

      if (!context.includes(ACTIVITY_STREAMS_CONTEXT)) {
        context.unshift(ACTIVITY_STREAMS_CONTEXT);
      }

      const hasXrdContext = context.some(c => typeof c === 'object' && c && c.xrd === XRD_CONTEXT.xrd);

      if (!hasXrdContext) {
        context.push(XRD_CONTEXT);
      }

      return context;
    },

    async getActor(ctx, actorId) {
      const actor = await ctx.call('activitypub.actor.get', { actorUri: actorId, webId: 'system' });
      if (!actor) throw new Error(`Actor not found: ${actorId}`);
      return actor;
    },

    extractDomain(identifier, contextDomain) {
      if (identifier.startsWith('acct:')) {
        const account = identifier.slice('acct:'.length);
        const parts = account.split('@');
        return parts.length === 2 ? parts[1] : null;
      }

      if (identifier.startsWith('mailto:')) {
        const address = identifier.slice('mailto:'.length);
        const parts = address.split('@');
        return parts.length === 2 ? parts[1] : null;
      }

      if (identifier.startsWith('did:')) {
        return contextDomain || null;
      }

      if (identifier.startsWith('http://') || identifier.startsWith('https://')) {
        try {
          return new URL(identifier).hostname;
        } catch {
          return null;
        }
      }

      // FEP-612d bare domain: the domain itself is the identifier.
      if (isBaredomain(identifier)) {
        return identifier;
      }

      return contextDomain || null;
    },

    async webfingerLookup(ctx, identifier, domain) {
      const localHost = this.settings.baseUrl ? new URL(this.settings.baseUrl).host : null;
      const accountMatch = identifier.match(/^acct:([^@]+)@(.+)$/);

      if (accountMatch && localHost && domain === localHost) {
        const localResource = await ctx.call('webfinger.get', { resource: identifier }).catch(() => null);
        const localHref = this.extractActivityPubHref(localResource);
        if (localHref) return localHref;
      }

      const candidates = [
        `https://${domain}/.well-known/webfinger?resource=${encodeURIComponent(identifier)}`,
        `http://${domain}/.well-known/webfinger?resource=${encodeURIComponent(identifier)}`
      ];

      const errors = [];
      for (const url of candidates) {
        try {
          const response = await fetch(url, {
            headers: { Accept: 'application/jrd+json, application/json' },
            timeout: this.settings.requestTimeoutMs
          });
          if (!response.ok) continue;

          const body = await response.json();
          const href = this.extractActivityPubHref(body);
          if (href) return href;
        } catch (e) {
          errors.push(`${url}: ${e.message}`);
        }
      }
      if (errors.length > 0) {
        this.logger.warn(
          `FEP-4adb webfinger lookup failed for ${identifier} at ${domain}. Tried: ${errors.join('; ')}`
        );
      }

      if (accountMatch) {
        const account = `${accountMatch[1]}@${accountMatch[2]}`;
        const remoteUri = await ctx.call('webfinger.getRemoteUri', { account }).catch(() => null);
        if (remoteUri) return remoteUri;
      }

      return null;
    },

    extractActivityPubHref(resource) {
      const links = Array.isArray(resource?.links) ? resource.links : [];
      const link =
        links.find(l => l?.type === 'application/activity+json' && typeof l?.href === 'string') ||
        links.find(l => l?.rel === 'self' && typeof l?.href === 'string');
      return link?.href || null;
    },

    async persistLocalActor(ctx, actorId, actorData) {
      if (!this.settings.baseUrl || !actorId.startsWith(this.settings.baseUrl)) {
        throw new Error('Only local actors can be updated');
      }

      const account = await ctx.call('auth.account.findByWebId', { webId: actorId }).catch(() => null);
      const options = account?.username ? { meta: { dataset: account.username } } : undefined;

      await ctx.call(
        'ldp.resource.put',
        {
          resourceUri: actorId,
          resource: actorData,
          contentType: JSON_LD,
          webId: 'system'
        },
        options
      );
    }
  }
};
