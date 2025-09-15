import urlJoin from 'url-join';
import { MigrationService } from '@semapps/migration';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';
const MIGRATION_VERSION = '2.3.0';

const Migration320Schema = {
  name: 'migration-3-2-0' as const,
  // @ts-expect-error TS(2322): Type '{ name: "migration"; settings: { baseUrl: un... Remove this comment to see the full error message
  mixins: [MigrationService],
  settings: {
    baseUrl: CONFIG.BASE_URL
  },
  actions: {
    migrate: {
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
            ctx.meta.skipObjectsWatcher = true; // We don't want to trigger an Update activity

            try {
              await this.actions.shareProfileWithContacts({ webId }, { parentCtx: ctx });

              await this.actions.generateAuthorizationsFromAnnounces({ webId }, { parentCtx: ctx });

              // Delete old containers
              await ctx.call('ldp.container.delete', {
                containerUri: urlJoin(webId, 'data/interop/data-grant'),
                webId: 'system'
              });
              await ctx.call('ldp.container.delete', {
                containerUri: urlJoin(webId, 'data/interop/delegated-data-grant'),
                webId: 'system'
              });

              // Create missing containers (delegated access grants, social agent registration...)
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
    },

    shareProfileWithContacts: {
      // Share user profile with all actors in contacts collection
      // This will generate a Social Agent Registration for every contact
      async handler(ctx) {
        const { webId } = ctx.params;

        const webIdData = await ctx.call('webid.get', { resourceUri: webId });

        const contactsCollection = await ctx.call('activitypub.collection.get', {
          resourceUri: webIdData['apods:contacts']
        });

        for (const contactUri of contactsCollection?.items) {
          await ctx.call('access-authorizations.addForSingleResource', {
            resourceUri: webIdData.url,
            grantee: contactUri,
            accessModes: ['acl:Read']
          });
        }
      }
    },

    generateAuthorizationsFromAnnounces: {
      // Generate authorizations from announces/announcers collections
      async handler(ctx) {
        const { webId } = ctx.params;

        let results = await ctx.call('triplestore.query', {
          query: `
            PREFIX apods: <http://activitypods.org/ns/core#>
            SELECT ?resourceUri ?announcesCollectionUri ?announcersCollectionUri
            WHERE {
              ?resourceUri apods:announces ?announcesCollectionUri .
              FILTER STRSTARTS(STR(?resourceUri), "${webId}") .
              OPTIONAL { ?resourceUri apods:announcers ?announcersCollectionUri . }
            }
          `,
          // @ts-expect-error TS(2304): Cannot find name 'username'.
          dataset: username,
          webId: 'system'
        });

        results = results.map((node: any) => ({
          resourceUri: node.resourceUri.value,
          announcesCollectionUri: node.announcesCollectionUri.value,
          announcersCollectionUri: node.announcersCollectionUri.value
        }));

        for (let { resourceUri, announcesCollectionUri, announcersCollectionUri } of results) {
          const announces = await ctx.call('activitypub.collection.get', { resourceUri: announcesCollectionUri });

          for (const actorUri of announces?.items) {
            const isAnnouncer = await ctx.call('activitypub.collection.includes', {
              collectionUri: announcersCollectionUri,
              itemUri: actorUri
            });

            await ctx.call('access-authorizations.addForSingleResource', {
              resourceUri,
              grantee: actorUri,
              accessModes: ['acl:Read'],
              delegationAllowed: isAnnouncer,
              delegationLimit: isAnnouncer ? 1 : undefined
            });
          }
        }
      }
    }
  }
} satisfies ServiceSchema;

export default Migration320Schema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [Migration320Schema.name]: typeof Migration320Schema;
    }
  }
}
