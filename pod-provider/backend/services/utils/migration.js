const { MigrationService } = require('@semapps/migration');
const CONFIG = require('../../config/config');

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
        const agent = await ctx.call('auth-agent.getAgent', { webId });
        if (agent) {
          this.logger.warn(`AuthorizationAgent already exist for ${webId}, skipping...`);
        } else {
          this.logger.info(`Creating AuthorizationAgent for ${webId}`);
          await ctx.call('auth-agent.initializeAgent', { webId });
        }
      }
    }
  }
};
