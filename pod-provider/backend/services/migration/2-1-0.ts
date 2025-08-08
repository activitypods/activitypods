// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import { MigrationService } from '@semapps/migration';
// @ts-expect-error TS(1192): Module '"/home/laurin/projects/virtual-assembly/ac... Remove this comment to see the full error message
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema, defineAction } from 'moleculer';
const MIGRATION_VERSION = '2.1.0';

const Migration210Schema = {
  name: 'migration-2-1-0' as const,
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
              await ctx.call('repair.createMissingContainers', { username });
              await this.actions.generateTypeIndexes({ webId }, { parentCtx: ctx });
              await ctx.call('type-registrations.resetFromRegistry', { webId });
              await ctx.call('webacl.resource.refreshContainersRights', { webId });
              await this.actions.generateDataRegistry({ webId }, { parentCtx: ctx });
              await this.actions.attachDataRegistrationToContainers({ webId }, { parentCtx: ctx });
              await ctx.call('repair.upgradeAllApps', { username });

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
    }),

    generateTypeIndexes: defineAction({
      async handler(ctx) {
        const { webId } = ctx.params;

        const publicIndex = await ctx.call('type-indexes.getPublicIndex', { webId });
        if (publicIndex) {
          this.logger.warn(`The public TypeIndex already exist for ${webId}, skipping...`);
        } else {
          this.logger.info(`Creating public TypeIndex for ${webId}`);
          await ctx.call('type-indexes.createPublicIndex', { webId });
        }

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
    }),

    generateDataRegistry: defineAction({
      async handler(ctx) {
        const { webId } = ctx.params;

        const dataRegistryExist = await ctx.call('data-registry.exist', { webId });
        if (dataRegistryExist) {
          this.logger.warn(`DataRegistry already exist for ${webId}, skipping...`);
        } else {
          this.logger.info(`Creating DataRegistry for ${webId}`);
          await ctx.call('data-registry.initializeResource', { webId });
        }
      }
    }),

    attachDataRegistrationToContainers: defineAction({
      async handler(ctx) {
        const { webId } = ctx.params;

        const registeredContainers = await ctx.call('ldp.registry.list');
        const podUrl = await ctx.call('solid-storage.getUrl', { webId });

        for (const options of Object.values(registeredContainers)) {
          // @ts-expect-error TS(18046): 'options' is of type 'unknown'.
          if (options.shapeTreeUri) {
            // @ts-expect-error TS(18046): 'options' is of type 'unknown'.
            const containerUri = urlJoin(podUrl, options.path);

            this.logger.info(`Attaching a DataRegistration to ${containerUri}`);

            await ctx.call('data-registrations.attachToContainer', {
              // @ts-expect-error TS(18046): 'options' is of type 'unknown'.
              shapeTreeUri: options.shapeTreeUri,
              containerUri,
              podOwner: webId
            });
          }
        }
      }
    })
  }
} satisfies ServiceSchema;

export default Migration210Schema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [Migration210Schema.name]: typeof Migration210Schema;
    }
  }
}
