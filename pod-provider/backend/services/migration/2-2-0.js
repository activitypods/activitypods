const urlJoin = require('url-join');
const { MigrationService } = require('@semapps/migration');
const CONFIG = require('../../config/config');

const MIGRATION_VERSION = '2.2.0';

module.exports = {
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
            await this.actions.generatePrivateTypeIndex({ webId }, { parentCtx: ctx });
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
            this.logger.error(`Unable to migrate Pod of ${webId} to ${MIGRATION_VERSION}. Error: ${e.message}`);
            console.error(e);
          }
        }
      }
    },
    async generatePrivateTypeIndex(ctx) {
      const { webId } = ctx.params;

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
    },
    async generateDataRegistry(ctx) {
      const { webId } = ctx.params;

      const dataRegistryExist = await ctx.call('data-registry.exist', { webId });
      if (dataRegistryExist) {
        this.logger.warn(`DataRegistry already exist for ${webId}, skipping...`);
      } else {
        this.logger.info(`Creating DataRegistry for ${webId}`);
        await ctx.call('data-registry.initializeResource', { webId });
      }
    },
    async attachDataRegistrationToContainers(ctx) {
      const { webId } = ctx.params;

      const registeredContainers = await ctx.call('ldp.registry.list');
      const podUrl = await ctx.call('solid-storage.getUrl', { webId });

      for (const options of Object.values(registeredContainers)) {
        if (options.shapeTreeUri) {
          const containerUri = urlJoin(podUrl, options.path);

          this.logger.info(`Attaching a DataRegistration to ${containerUri}`);

          await ctx.call('data-registrations.attachToContainer', {
            shapeTreeUri: options.shapeTreeUri,
            containerUri,
            podOwner: webId
          });
        }
      }
    }
  }
};
