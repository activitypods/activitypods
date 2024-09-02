const urlJoin = require('url-join');
const { triple, namedNode, literal } = require('@rdfjs/data-model');
const CONFIG = require('../config/config');

module.exports = {
  name: 'migration',
  actions: {
    async migrateAllPods(ctx) {
      for (const account of await ctx.call('auth.account.find')) {
        this.logger.info(`Migrating Pod of ${account.webId}...`);

        // TODO Handle Pod versioning

        this.actions.addSolidPredicates(account, { parentCtx: ctx });
        this.actions.attachCollectionsToContainer(account, { parentCtx: ctx });
        this.actions.migratePreferredLocale(account, { parentCtx: ctx });
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
        this.logger.warn(`No preferred locale found for ${account.webId}`);
      }
    },
    async updateCollectionsOptions(ctx) {
      await ctx.call('activitypub.follow.updateCollectionsOptions');
      await ctx.call('activitypub.inbox.updateCollectionsOptions');
      await ctx.call('activitypub.outbox.updateCollectionsOptions');
      await ctx.call('activitypub.like.updateCollectionsOptions');
      await ctx.call('activitypub.reply.updateCollectionsOptions');
      await ctx.call('contacts.manager.updateCollectionsOptions');
      await ctx.call('contacts.request.updateCollectionsOptions');

      // Persist options of existing /attendees collections, even if they are now handled by the app backend
      await ctx.call('activitypub.collections-registry.updateCollectionsOptions', {
        collection: {
          attachPredicate: 'http://activitypods.org/ns/core#attendees',
          ordered: false,
          dereferenceItems: false
        }
      });

      // TODO persist options for the /announces and /announcers services
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
    async registerClassDescriptions(ctx) {
      await ctx.call('profiles.profile.registerClassDescriptionForAll');
      await ctx.call('profiles.location.registerClassDescriptionForAll');
      await ctx.call('profiles.contactgroup.registerClassDescriptionForAll');
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
    }
  }
};
