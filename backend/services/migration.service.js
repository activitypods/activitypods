const { triple, namedNode, literal } = require('@rdfjs/data-model');
const CONFIG = require('../config/config');

module.exports = {
  name: 'migration',
  actions: {
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
      for (let dataset of await ctx.call('pod.list')) {
        const collectionsContainerUri = urlJoin(CONFIG.HOME_URL, dataset, '/data/as/collection');

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
      }
    },
    async registerClassDescriptions(ctx) {
      await ctx.call('profiles.profile.registerClassDescriptionForAll');
      await ctx.call('profiles.location.registerClassDescriptionForAll');
      await ctx.call('profiles.contactgroup.registerClassDescriptionForAll');
    },
    async migratePreferredLocale(ctx) {
      for (let dataset of await ctx.call('pod.list')) {
        const [account] = await ctx.call('auth.account.find', { query: { username: dataset } });
        if (account.preferredLocale) {
          this.logger.info(`Migrating preferred locale for ${account.webId}`);
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
            id: account['@id'],
            preferredLocale: undefined
          });
        } else {
          this.logger.warn(`No preferred locale found for ${account.webId}`);
        }
      }
    }
  }
};
