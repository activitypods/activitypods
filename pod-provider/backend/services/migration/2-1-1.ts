// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { MigrationService } from '@semapps/migration';
// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../../config/config.ts';

const MIGRATION_VERSION = '2.1.1';

export default {
  name: 'migration-2-1-1',
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
            await this.actions.deleteContactsCollectionsPermissions({ webId }, { parentCtx: ctx });

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
    async deleteContactsCollectionsPermissions(ctx: any) {
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
          // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
          this.logger.info(`Removing permissions from ${contactsCollection}...`);
          await ctx.call('webacl.resource.deleteAllRights', { resourceUri: contactsCollection });
        }
      }
    }
  }
};
