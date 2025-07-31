// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { MigrationService } from '@semapps/migration';
// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../../config/config.ts';

const MIGRATION_VERSION = '2.1.0';

export default {
  name: 'migration-2-1-0',
  mixins: [MigrationService],
  settings: {
    baseUrl: CONFIG.BASE_URL
  },
  actions: {
    async migrate(ctx: any) {
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
            await ctx.call('repair.createMissingContainers', { username });
            // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ migra... Remove this comment to see the full error message
            await this.actions.generateTypeIndexes({ webId }, { parentCtx: ctx });
            await ctx.call('type-registrations.resetFromRegistry', { webId });
            await ctx.call('webacl.resource.refreshContainersRights', { webId });
            // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ migra... Remove this comment to see the full error message
            await this.actions.generateDataRegistry({ webId }, { parentCtx: ctx });
            // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ migra... Remove this comment to see the full error message
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
            // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
            this.logger.error(`Unable to migrate Pod of ${webId} to ${MIGRATION_VERSION}. Error: ${e.message}`);
            console.error(e);
          }
        }
      }
    },
    async generateTypeIndexes(ctx: any) {
      const { webId } = ctx.params;

      const publicIndex = await ctx.call('type-indexes.getPublicIndex', { webId });
      if (publicIndex) {
        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
        this.logger.warn(`The public TypeIndex already exist for ${webId}, skipping...`);
      } else {
        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
        this.logger.info(`Creating public TypeIndex for ${webId}`);
        await ctx.call('type-indexes.createPublicIndex', { webId });
      }

      const preferencesFileExist = await ctx.call('solid-preferences-file.exist', { webId });
      if (preferencesFileExist) {
        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
        this.logger.warn(`PreferencesFile already exist for ${webId}, skipping...`);
      } else {
        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
        this.logger.info(`Creating PreferencesFile for ${webId}`);
        await ctx.call('solid-preferences-file.initializeResource', { webId });
      }

      const privateIndex = await ctx.call('type-indexes.getPrivateIndex', { webId });
      if (privateIndex) {
        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
        this.logger.warn(`The private TypeIndex already exist for ${webId}, skipping...`);
      } else {
        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
        this.logger.info(`Creating private TypeIndex for ${webId}`);
        await ctx.call('type-indexes.createPrivateIndex', { webId });
      }
    },
    async generateDataRegistry(ctx: any) {
      const { webId } = ctx.params;

      const dataRegistryExist = await ctx.call('data-registry.exist', { webId });
      if (dataRegistryExist) {
        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
        this.logger.warn(`DataRegistry already exist for ${webId}, skipping...`);
      } else {
        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
        this.logger.info(`Creating DataRegistry for ${webId}`);
        await ctx.call('data-registry.initializeResource', { webId });
      }
    },
    async attachDataRegistrationToContainers(ctx: any) {
      const { webId } = ctx.params;

      const registeredContainers = await ctx.call('ldp.registry.list');
      const podUrl = await ctx.call('solid-storage.getUrl', { webId });

      for (const options of Object.values(registeredContainers)) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        if (options.shapeTreeUri) {
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          const containerUri = urlJoin(podUrl, options.path);

          // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
          this.logger.info(`Attaching a DataRegistration to ${containerUri}`);

          await ctx.call('data-registrations.attachToContainer', {
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            shapeTreeUri: options.shapeTreeUri,
            containerUri,
            podOwner: webId
          });
        }
      }
    }
  }
};
