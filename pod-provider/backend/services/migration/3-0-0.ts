import { V20MigrationService } from '@semapps/migration';
import { ServiceSchema } from 'moleculer';
import * as CONFIG from '../../config/config.ts';

const MIGRATION_VERSION = '3.0.0';

const Migration300Schema = {
  name: 'migration-3-0-0' as const,
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
            await this.actions.migratePseudoIds({ dataset: username }, { parentCtx: ctx });

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
} satisfies ServiceSchema;

export default Migration300Schema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [Migration300Schema.name]: typeof Migration300Schema;
    }
  }
}
