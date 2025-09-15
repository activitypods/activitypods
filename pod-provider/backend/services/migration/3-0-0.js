const { V20MigrationService } = require('@semapps/migration');
const CONFIG = require('../../config/config');

const MIGRATION_VERSION = '3.0.0';

module.exports = {
  name: 'migration-3-0-0',
  mixins: [V20MigrationService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    podProvider: true
  },
  actions: {
    async migrate(ctx) {
      const { username } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      for (const { webId, username, version, ...rest } of accounts) {
        if (version === MIGRATION_VERSION) {
          this.logger.info(`Pod of ${webId} is already on v${MIGRATION_VERSION}, skipping...`);
        } else {
          this.logger.info(`Migrating Pod of ${webId} to v${MIGRATION_VERSION}...`);

          ctx.meta.dataset = username;
          ctx.meta.webId = webId;
          ctx.meta.skipObjectsWatcher = true; // We don't want to trigger an Update activity

          try {
            // Migration utils from SemApps V20MigrationService
            await this.actions.moveAllToNamedGraph({ dataset: username }, { parentCtx: ctx });
            await this.actions.migrateCurrentPredicate({ dataset: username }, { parentCtx: ctx });

            await ctx.call('auth.account.update', {
              id: rest['@id'],
              webId,
              username,
              version: MIGRATION_VERSION,
              ...rest
            });
          } catch (e) {
            this.logger.error(`Unable to migrate Pod of ${webId} to ${MIGRATION_VERSION}. Error: ${e.message}`);
            console.error(e);
          }
        }
      }
    }
  }
};
