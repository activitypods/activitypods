// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import { MigrationService } from '@semapps/migration';
// @ts-expect-error TS(1192): Module '"/home/laurin/projects/virtual-assembly/ac... Remove this comment to see the full error message
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema, defineAction } from 'moleculer';
const MIGRATION_VERSION = '2.2.0';

const Migration220Schema = {
  name: 'migration-2-2-0' as const,
  // @ts-expect-error TS(2322): Type '{ name: "migration"; settings: { baseUrl: un... Remove this comment to see the full error message
  mixins: [MigrationService],
  settings: {
    baseUrl: CONFIG.BASE_URL
  },
  actions: {
    migrate: defineAction({
      async handler(ctx) {
        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { webId, username, version, ...rest } of accounts) {
          if (version === MIGRATION_VERSION) {
            this.logger.info(`Pod of ${webId} is already on v${MIGRATION_VERSION}, skipping...`);
          } else {
            this.logger.info(`Migrating Pod of ${webId} to v${MIGRATION_VERSION}...`);

            // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
            ctx.meta.dataset = username;
            // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
            ctx.meta.webId = webId;
            // @ts-expect-error TS(2339): Property 'skipObjectsWatcher' does not exist on ty... Remove this comment to see the full error message
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
              // @ts-expect-error TS(18046): 'e' is of type 'unknown'.
              this.logger.error(`Unable to migrate Pod of ${webId} to ${MIGRATION_VERSION}. Error: ${e.message}`);
              console.error(e);
            }
          }
        }
      }
    })
  }
} satisfies ServiceSchema;

export default Migration220Schema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [Migration220Schema.name]: typeof Migration220Schema;
    }
  }
}
