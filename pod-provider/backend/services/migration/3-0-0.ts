import urlJoin from 'url-join';
import { V20MigrationService } from '@semapps/migration';
import { ServiceSchema } from 'moleculer';
import * as CONFIG from '../../config/config.ts';
import { Account } from '@semapps/auth';

const MIGRATION_VERSION = '3.0.0';

const Migration300Schema = {
  name: 'migration-3-0-0' as const,
  // @ts-expect-error
  mixins: [V20MigrationService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    podProvider: true
  },
  actions: {
    async migrate(ctx: any) {
      const { username } = ctx.params;
      const accounts: Account[] = await ctx.call('auth.account.find', {
        query: username === '*' ? undefined : { username }
      });

      for (const { webId, username: dataset, version, ...rest } of accounts) {
        if (version === MIGRATION_VERSION) {
          this.logger.info(`Account ${dataset} is already on v${MIGRATION_VERSION}, skipping...`);
        } else {
          this.logger.info(`Migrating account ${dataset} to v${MIGRATION_VERSION}...`);

          ctx.meta.dataset = dataset;
          ctx.meta.isMigrating = true;
          ctx.meta.skipObjectsWatcher = true; // We don't want to trigger an Update activity

          try {
            // Migration utils from SemApps V20MigrationService
            await this.actions.migrateAllContainers({ dataset }, { parentCtx: ctx });
            await this.actions.migrateTypeIndex({ dataset }, { parentCtx: ctx });
            ctx.meta.webId = await this.actions.migrateWebId({ dataset }, { parentCtx: ctx });
            await this.actions.deleteIntermediaryContainers({ dataset }, { parentCtx: ctx });
            await this.actions.migrateCurrentPredicate({ dataset }, { parentCtx: ctx });
            await this.actions.migratePseudoIds({ dataset }, { parentCtx: ctx });
            await this.actions.attachAllContainersToRootContainer({ dataset }, { parentCtx: ctx });

            const singleResourceContainersUris = {
              'pim/configuration-file': 'pim:ConfigurationFile',
              'interop/authorization-agent': 'interop:AuthorizationAgent',
              'interop/registry-set': 'interop:RegistrySet',
              'interop/agent-registry': 'interop:AgentRegistry',
              'interop/authorization-registry': 'interop:AuthorizationRegistry',
              'interop/data-registry': 'interop:DataRegistry'
            };

            for (const [path, type] of Object.entries(singleResourceContainersUris)) {
              await this.actions.migrateSingleResourcesContainer(
                {
                  oldContainerUri: urlJoin(this.settings.baseUrl, dataset, 'data', path),
                  types: [type],
                  isPrivate: true // All the above containers are private
                },
                { parentCtx: ctx }
              );
            }

            await ctx.call('auth.account.update', {
              id: rest['@id'],
              webId: ctx.meta.webId, // WebID has changed !
              username: dataset,
              version: MIGRATION_VERSION,
              ...rest
            });
          } catch (e) {
            this.logger.error(`Unable to migrate storage ${dataset} to ${MIGRATION_VERSION}. Error: ${e.message}`);
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
