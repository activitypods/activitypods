const fetch = require('node-fetch');

module.exports = {
  name: 'fep-4adb-webfinger',
  dependencies: ['webfinger', 'fep-4adb-dereferencer'],

  settings: {
    baseUrl: process.env.SEMAPPS_HOME_URL || '',
    requestTimeoutMs: 5000
  },

  actions: {
    async lookup(ctx) {
      const { resource, domain } = ctx.params;
      if (!resource || !domain) throw new Error('resource and domain are required');

      const localHost = this.settings.baseUrl ? new URL(this.settings.baseUrl).host : null;
      const isLocalLookup = localHost && domain === localHost && resource.startsWith('acct:');

      if (isLocalLookup) {
        return ctx.call('webfinger.get', { resource });
      }

      const candidates = [
        `https://${domain}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`,
        `http://${domain}/.well-known/webfinger?resource=${encodeURIComponent(resource)}`
      ];

      for (const url of candidates) {
        try {
          const response = await fetch(url, {
            headers: { Accept: 'application/jrd+json, application/json' },
            timeout: this.settings.requestTimeoutMs
          });
          if (!response.ok) continue;
          return response.json();
        } catch (e) {
          this.logger.debug(`FEP-4adb remote webfinger failed (${url}): ${e.message}`);
        }
      }

      throw new Error(`Unable to resolve webfinger resource ${resource} on ${domain}`);
    },

    async registerAlias(ctx) {
      const { actorId, alias } = ctx.params;
      if (!actorId || !alias) throw new Error('actorId and alias are required');
      return ctx.call('fep-4adb-dereferencer.addAlias', { actorId, alias });
    },

    async unregisterAlias(ctx) {
      const { actorId, alias } = ctx.params;
      if (!actorId || !alias) throw new Error('actorId and alias are required');
      return ctx.call('fep-4adb-dereferencer.removeAlias', { actorId, alias });
    }
  }
};
