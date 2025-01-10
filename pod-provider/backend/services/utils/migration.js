const { MigrationService } = require('@semapps/migration');
const CONFIG = require('../../config/config');
const { arrayOf } = require('@semapps/ldp');

module.exports = {
  name: 'migration',
  mixins: [MigrationService],
  settings: {
    baseUrl: CONFIG.BASE_URL
  },
  actions: {
    async addAuthorizationAgent(ctx) {
      const { username } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      for (const { webId } of accounts) {
        let authAgent = await ctx.call('auth-agent.get', { webId });
        if (authAgent) {
          this.logger.warn(`AuthorizationAgent already exist for ${webId}, skipping...`);
        } else {
          this.logger.info(`Creating AuthorizationAgent for ${webId}`);
          await ctx.call('auth-agent.initializeResource', { webId });
          authAgent = await ctx.call('auth-agent.get', { webId });
        }

        const appRegistrationsContainer = await ctx.call('app-registrations.list', { webId });
        const appRegistrations = arrayOf(appRegistrationsContainer['ldp:contains']);

        for (const appRegistration of appRegistrations) {
          this.logger.info(
            `Adding interop:registeredWith to app registration of ${appRegistration['interop:registeredAgent']} (webId ${webId})`
          );

          await ctx.call('app-registrations.patch', {
            resourceUri: appRegistration.id,
            triplesToAdd: [
              triple(
                namedNode(appRegistration.id),
                namedNode('http://www.w3.org/ns/solid/interop#registeredWith'),
                namedNode(authAgent.id)
              )
            ],
            webId: 'system'
          });
        }
      }
    },
    async generateRegistries(ctx) {
      const { username } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      for (const { webId } of accounts) {
        const registrySet = await ctx.call('registry-set.get', { webId });
        if (registrySet) {
          this.logger.warn(`RegistrySet already exist for ${webId}, skipping...`);
        } else {
          this.logger.info(`Creating RegistrySet for ${webId}`);
          await ctx.call('registry-set.initializeResource', { webId });
        }

        const authRegistry = await ctx.call('auth-registry.get', { webId });
        if (authRegistry) {
          this.logger.warn(`AuthorizationRegistry already exist for ${webId}, skipping...`);
        } else {
          this.logger.info(`Creating AuthorizationRegistry for ${webId}`);
          await ctx.call('auth-registry.initializeResource', { webId });
        }
      }
    }
  }
};
