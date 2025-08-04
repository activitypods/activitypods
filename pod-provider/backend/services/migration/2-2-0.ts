import urlJoin from 'url-join';
import { MigrationService } from '@semapps/migration';
import CONFIG from '../../config/config.ts';
const MIGRATION_VERSION = '2.2.0';

const Migration220Schema = {
  name: 'migration-2-2-0',
  mixins: [MigrationService],
  settings: {
    baseUrl: CONFIG.BASE_URL
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
          ctx.meta.skipObjectsWatcher = true; // We don't want to trigger an Update

          try {
            // Delete old capabilities containers.
            const containerUri = urlJoin(webId, 'data/capabilities');
            await ctx.call('ldp.container.delete', { containerUri, webId: 'system' });

            await ctx.call('repair.createMissingContainers', { username });
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

export default Migration220Schema;
