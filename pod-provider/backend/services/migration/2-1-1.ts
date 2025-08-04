const urlJoin = require('url-join');
const { MigrationService } = require('@semapps/migration');
const CONFIG = require('../../config/config');

const MIGRATION_VERSION = '2.1.1';

module.exports = {
  name: 'migration-2-1-1',
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
            await ctx.call('repair.createMissingContainers', { username });
            await this.actions.deleteContactsCollectionsPermissions({ webId }, { parentCtx: ctx });

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
    async deleteContactsCollectionsPermissions(ctx) {
      const { webId } = ctx.params;

      const webIdData = await ctx.call('webid.get', { resourceUri: webId });

      const contactsCollections = [
        webIdData['apods:contacts'],
        webIdData['apods:contactRequests'],
        webIdData['apods:ignoredContacts'],
        webIdData['apods:rejectedContacts']
      ];

      for (const contactsCollection of contactsCollections) {
        if (contactsCollection) {
          this.logger.info(`Removing permissions from ${contactsCollection}...`);
          await ctx.call('webacl.resource.deleteAllRights', { resourceUri: contactsCollection });
        }
      }
    }
  }
};
