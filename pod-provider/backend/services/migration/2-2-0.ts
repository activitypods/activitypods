// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { MigrationService } from '@semapps/migration';
// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../../config/config.ts';
import { ServiceSchema, defineAction } from 'moleculer';
const MIGRATION_VERSION = '2.2.0';

const Migration220ServiceSchema = {
  name: 'migration-2-2-0' as const,
  mixins: [MigrationService],

  settings: {
    baseUrl: CONFIG.BASE_URL
  },

  actions: {
    migrate: defineAction({
      async handler(ctx: any) {
        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { webId, username, version, ...rest } of accounts) {
          if (version === MIGRATION_VERSION) {
            // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
            this.logger.info(`Pod of ${webId} is already on v${MIGRATION_VERSION}, skipping...`);
          } else {
            // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
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
              // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
              this.logger.error(`Unable to migrate Pod of ${webId} to ${MIGRATION_VERSION}. Error: ${e.message}`);
              console.error(e);
            }
          }
        }
      }
    })
  }
} satisfies ServiceSchema;

export default Migration220ServiceSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [Migration220ServiceSchema.name]: typeof Migration220ServiceSchema;
    }
  }
}
