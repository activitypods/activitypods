const urlJoin = require('url-join');
const { triple, namedNode, literal } = require('@rdfjs/data-model');
const { MigrationService } = require('@semapps/migration');
const CONFIG = require('../config/config');

module.exports = {
  name: 'migration',
  mixins: [MigrationService],
  actions: {
    async migrate(ctx) {
      const { username } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      for (const account of accounts) {
        if (account.version === '2.0.0') {
          this.logger.info(`Pod of ${account.webId} is already on v2, skipping...`);
        } else {
          this.logger.info(`Migrating Pod of ${account.webId}...`);

          // WebID
          this.actions.migratePreferredLocale(account, { parentCtx: ctx });
          this.actions.addSolidPredicates(account, { parentCtx: ctx });
          this.actions.addTypeIndex(account, { parentCtx: ctx });

          // Collections
          this.actions.attachCollectionsToContainer(account, { parentCtx: ctx });
          this.actions.persistCollectionsOptions(account, { parentCtx: ctx });

          // Containers
          this.actions.moveResourcesToNewContainers(account, { parentCtx: ctx });
          this.actions.deleteUnusedContainers(account, { parentCtx: ctx });

          await ctx.call('auth.account.update', {
            ...account,
            version: '2.0.0'
          });
        }
      }
    },
    async migratePreferredLocale(ctx) {
      const account = ctx.params;
      this.logger.info(`Migrating preferred locale...`);

      if (account.preferredLocale) {
        await ctx.call('ldp.resource.patch', {
          resourceUri: account.webId,
          triplesToAdd: [
            triple(
              namedNode(account.webId),
              namedNode('http://schema.org/knowsLanguage'),
              literal(account.preferredLocale)
            )
          ],
          webId: 'system'
        });

        await ctx.call('auth.account.update', {
          ...account,
          preferredLocale: undefined
        });
        this.logger.info('DONE');
      } else {
        this.logger.warn(`No preferred locale found`);
      }
    },
    async addSolidPredicates(ctx) {
      const account = ctx.params;
      this.logger.info(`Migrating solid predicates...`);

      if (account.podUri) {
        await ctx.call('ldp.resource.patch', {
          resourceUri: account.webId,
          triplesToAdd: [
            triple(
              namedNode(account.webId),
              namedNode('http://www.w3.org/ns/pim/space#storage'),
              namedNode(account.podUri)
            )
          ],
          webId: 'system'
        });

        await ctx.call('ldp.resource.patch', {
          resourceUri: account.webId,
          triplesToAdd: [
            triple(
              namedNode(account.webId),
              namedNode('http://www.w3.org/ns/solid/terms#oidcIssuer'),
              namedNode(new URL(account.webId).origin)
            )
          ],
          webId: 'system'
        });

        await ctx.call('auth.account.update', {
          ...account,
          podUri: undefined
        });

        this.logger.info(`DONE`);
      } else {
        this.logger.warn(`No pod URI found for ${account.webId}`);
      }
    },
    async addTypeIndex(ctx) {
      const { webId } = ctx.params;
      this.logger.info(`Adding TypeIndex to ${webId}...`);

      const podUrl = await ctx.call('pod.getUrl', { webId });
      await ctx.call('type-indexes.createAndAttachToWebId', { webId });

      // Go through each registered container and persist them
      const registeredContainers = await ctx.call('ldp.registry.list');
      for (const container of Object.values(registeredContainers)) {
        const containerUri = urlJoin(podUrl, container.path);
        for (const type of arrayOf(container.acceptedTypes)) {
          await ctx.call('type-registrations.register', { type, containerUri, webId });
          if (container.description) {
            await ctx.call('type-registrations.attachDescription', {
              type,
              webId,
              ...container.description
            });
          }
        }
      }
    },
    async attachCollectionsToContainer(ctx) {
      const { username: dataset } = ctx.params;

      const collectionsContainerUri = urlJoin(CONFIG.BASE_URL, dataset, '/data/as/collection');

      this.logger.info(`Attaching all collections in ${dataset} dataset to ${collectionsContainerUri}`);

      await ctx.call('triplestore.update', {
        query: `
          PREFIX as: <https://www.w3.org/ns/activitystreams#>
          PREFIX ldp: <http://www.w3.org/ns/ldp#>
          INSERT {
            <${collectionsContainerUri}> ldp:contains ?collectionUri
          }
          WHERE {
            ?collectionUri a as:Collection
          }
        `,
        webId: 'system',
        dataset
      });
    },
    async persistCollectionsOptions(ctx) {
      const { username: dataset } = ctx.params;

      await ctx.call('activitypub.follow.updateCollectionsOptions', { dataset });
      await ctx.call('activitypub.inbox.updateCollectionsOptions', { dataset });
      await ctx.call('activitypub.outbox.updateCollectionsOptions', { dataset });
      await ctx.call('activitypub.like.updateCollectionsOptions', { dataset });
      await ctx.call('activitypub.reply.updateCollectionsOptions', { dataset });
      await ctx.call('contacts.manager.updateCollectionsOptions', { dataset });
      await ctx.call('contacts.request.updateCollectionsOptions', { dataset });
      await ctx.call('announcer.updateCollectionsOptions', { dataset });

      // Persist options of existing /attendees collections, even if they are now handled by the app backend
      await ctx.call('activitypub.collections-registry.updateCollectionsOptions', {
        collection: {
          attachPredicate: 'http://activitypods.org/ns/core#attendees',
          ordered: false,
          dereferenceItems: false
        },
        dataset
      });
    },
    async moveResourcesToNewContainers(ctx) {
      const { webId, username: dataset } = ctx.params;

      const containersMapping = {
        '/files': '/semapps/file',
        '/profiles': '/vcard/individual',
        '/locations': '/vcard/location',
        '/events': '/as/event',
        '/notes': '/as/note',
        '/activities': '/as/activity',
        '/offers': '/maid/offer',
        '/requests': '/maid/request',
        '/groups': '/vcard/group'
      };

      for (const [oldPath, newPath] of Object.entries(containersMapping)) {
        const oldContainerUri = urlJoin(webId, 'data', oldPath);
        const newContainerUri = urlJoin(webId, 'data', newPath);

        this.logger.info(`Moving all resources from ${oldContainerUri} to ${newContainerUri}`);

        await this.actions.moveResourcesToContainer(
          {
            oldContainerUri,
            newContainerUri,
            dataset
          },
          { parentCtx: ctx }
        );

        const isEmpty = await ctx.call('ldp.container.isEmpty', { containerUri: oldContainerUri, webId });

        if (isEmpty) {
          this.logger.info(`Deleting empty container ${oldContainerUri}`);
          await ctx.call('ldp.container.delete', { containerUri: oldContainerUri, webId });
        } else {
          this.logger.warn(`Cannot delete old container ${oldContainerUri} as it is not empty`);
        }
      }
    },
    async deleteUnusedContainers(ctx) {
      const { webId } = ctx.params;

      // Containers which are not used anymore in v2
      const unusedContainersPaths = ['/projects', '/skills', '/syreen', '/front-apps'];

      for (const unusedContainerPath of unusedContainersPaths) {
        const unusedContainerUri = urlJoin(webId, 'data', unusedContainerPath);

        const isEmpty = await ctx.call('ldp.container.isEmpty', { containerUri: unusedContainerUri, webId });

        if (isEmpty) {
          this.logger.info(`Deleting unused container ${unusedContainerUri}`);
          await ctx.call('ldp.container.delete', { containerUri: unusedContainerUri, webId });
        } else {
          this.logger.warn(`Cannot delete unused container ${unusedContainerUri} as it is not empty`);
        }
      }
    }
  }
};
