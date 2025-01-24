const { MigrationService } = require('@semapps/migration');
const CONFIG = require('../../config/config');

module.exports = {
  name: 'migration-2-1-0',
  mixins: [MigrationService],
  settings: {
    baseUrl: CONFIG.BASE_URL
  },
  actions: {
    async migrate(ctx) {
      const { username, version } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      for (const account of accounts) {
        // if (account.version === version) {
        //   this.logger.info(`Pod of ${account.webId} is already on v${version}, skipping...`);
        // } else {
        this.logger.info(`Migrating Pod of ${account.webId} to v${version}...`);

        ctx.meta.dataset = account.username;
        ctx.meta.webId = account.webId;
        ctx.meta.skipObjectsWatcher = true; // We don't want to trigger an Update

        if (version === '2.1.0') {
          await ctx.call('repair.createMissingContainers', { username: account.username });
          await this.actions.generatePrivateTypeIndex({ username: account.username }, { parentCtx: ctx });
        } else {
          throw new Error(`No migration exist for version ${version}`);
        }

        await ctx.call('auth.account.update', {
          id: account['@id'],
          ...account,
          version
        });
        // }
      }
    },
    async generatePrivateTypeIndex(ctx) {
      const { username } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      for (const { webId } of accounts) {
        const preferencesFileExist = await ctx.call('solid-preferences-file.exist', { webId });
        if (preferencesFileExist) {
          this.logger.warn(`PreferencesFile already exist for ${webId}, skipping...`);
        } else {
          this.logger.info(`Creating PreferencesFile for ${webId}`);
          await ctx.call('solid-preferences-file.initializeResource', { webId });
        }

        const privateIndex = await ctx.call('type-indexes.getPrivateIndex', { webId });
        if (privateIndex) {
          this.logger.warn(`The private TypeIndex already exist for ${webId}, skipping...`);
        } else {
          this.logger.info(`Creating private TypeIndex for ${webId}`);
          await ctx.call('type-indexes.createPrivateIndex', { webId });
        }
      }
    }
  }
};
