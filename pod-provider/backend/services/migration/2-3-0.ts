import urlJoin from 'url-join';
import { MigrationService } from '@semapps/migration';
import { arrayOf } from '@semapps/ldp';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';
const MIGRATION_VERSION = '2.3.0';

/**
 * Migrate Pods to the ActivityPods 2.3 sharing model (social agent registrations and access authorizations).
 * Can be run several times: Pods already on 2.3.0 are skipped, and the authorizations that already exist are kept.
 * A Pod for which an authorization could not be generated stays on its version, so running it again retries it.
 * Call it from the Moleculer CLI: call migration-2-3-0.migrate --username "*"
 */
const Migration230Schema = {
  name: 'migration-2-3-0' as const,
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

        let migrated = 0;
        const failed: string[] = [];

        // Create the missing containers of ALL local Pods first, including the ones that are not migrated by this call:
        // the authorizations generated below are sent to local contacts, whose Pods need a social agent registrations container
        const allAccounts = (username === '*' ? accounts : await ctx.call('auth.account.find')) as any[];
        for (const account of allAccounts) {
          if (account.deletedAt) continue;
          try {
            await ctx.call('repair.createMissingContainers', { username: account.username });
          } catch (e) {
            // @ts-expect-error TS(18046): 'e' is of type 'unknown'.
            this.logger.warn(`Unable to create the missing containers of ${account.webId}. Error: ${e.message}`);
          }
        }

        for (const { webId, username, version, ...rest } of accounts) {
          if (version === MIGRATION_VERSION) {
            this.logger.info(`Pod of ${webId} is already on v${MIGRATION_VERSION}, skipping...`);
          } else {
            this.logger.info(`Migrating Pod of ${webId} to v${MIGRATION_VERSION}...`);

            ctx.meta.dataset = username;
            ctx.meta.webId = webId;
            ctx.meta.skipObjectsWatcher = true; // We don't want to trigger an Update activity

            try {
              const errors =
                (await this.actions.shareProfileWithContacts({ webId }, { parentCtx: ctx })) +
                (await this.actions.generateAuthorizationsFromAnnounces(
                  { webId, dataset: username },
                  { parentCtx: ctx }
                ));

              // Keep the Pod on its current version, so that the migration can be run again for it
              if (errors > 0) throw new Error(`${errors} authorization(s) could not be generated, see warnings above`);

              // Delete old containers (they may already be gone if the migration was interrupted)
              for (const path of ['data/interop/data-grant', 'data/interop/delegated-data-grant']) {
                const containerUri = urlJoin(webId, path);
                const containerExist = await ctx.call('ldp.container.exist', { containerUri, webId: 'system' });
                if (containerExist) {
                  await ctx.call('ldp.container.delete', { containerUri, webId: 'system' });
                }
              }

              await ctx.call('auth.account.update', {
                id: rest['@id'],
                webId,
                username,
                version: MIGRATION_VERSION,
                ...rest
              });

              migrated++;
            } catch (e) {
              failed.push(username);
              // @ts-expect-error TS(18046): 'e' is of type 'unknown'.
              this.logger.error(`Unable to migrate Pod of ${webId} to ${MIGRATION_VERSION}. Error: ${e.message}`);
              console.error(e);
            }
          }
        }

        this.logger.info(
          `Migration to v${MIGRATION_VERSION} finished: ${migrated} Pod(s) migrated, ${failed.length} failed${
            failed.length > 0 ? ` (${failed.join(', ')})` : ''
          }`
        );

        return { migrated, failed };
      }
    },

    shareProfileWithContacts: {
      // Share user profile with all actors in contacts collection
      // This will generate a Social Agent Registration for every contact
      async handler(ctx) {
        const { webId } = ctx.params;

        const webIdData = await ctx.call('webid.get', { resourceUri: webId });

        // Nothing to share if the user has no profile or no contacts collection
        if (!webIdData.url || !webIdData['apods:contacts']) return 0;

        const contactsCollection = await ctx.call('activitypub.collection.get', {
          resourceUri: webIdData['apods:contacts']
        });

        let errors = 0;
        for (const contactUri of arrayOf(contactsCollection?.items)) {
          try {
            await ctx.call('access-authorizations.addForSingleResource', {
              resourceUri: webIdData.url,
              grantee: contactUri,
              accessModes: ['acl:Read']
            });
          } catch (e) {
            // Go on with the other contacts, the Pod will be marked as failed
            errors++;
            // @ts-expect-error TS(18046): 'e' is of type 'unknown'.
            this.logger.warn(`Unable to share the profile of ${webId} with ${contactUri}. Error: ${e.message}`);
          }
        }
        return errors;
      }
    },

    generateAuthorizationsFromAnnounces: {
      // Generate authorizations from announces/announcers collections
      async handler(ctx) {
        const { webId, dataset } = ctx.params;

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
          dataset,
          webId: 'system'
        });

        results = results.map((node: any) => ({
          resourceUri: node.resourceUri.value,
          announcesCollectionUri: node.announcesCollectionUri.value,
          // Only resources whose sharing was delegated to someone have an announcers collection
          announcersCollectionUri: node.announcersCollectionUri?.value
        }));

        let errors = 0;
        for (const { resourceUri, announcesCollectionUri, announcersCollectionUri } of results) {
          const announces = await ctx.call('activitypub.collection.get', { resourceUri: announcesCollectionUri });

          for (const actorUri of arrayOf(announces?.items)) {
            try {
              const isAnnouncer = announcersCollectionUri
                ? await ctx.call('activitypub.collection.includes', {
                    collectionUri: announcersCollectionUri,
                    itemUri: actorUri
                  })
                : false;

              await ctx.call('access-authorizations.addForSingleResource', {
                resourceUri,
                grantee: actorUri,
                accessModes: ['acl:Read'],
                delegationAllowed: isAnnouncer,
                delegationLimit: isAnnouncer ? 1 : undefined
              });
            } catch (e) {
              // Go on with the other shared resources, the Pod will be marked as failed
              errors++;
              this.logger.warn(
                // @ts-expect-error TS(18046): 'e' is of type 'unknown'.
                `Unable to generate an authorization for ${actorUri} on ${resourceUri}. Error: ${e.message}`
              );
            }
          }
        }
        return errors;
      }
    }
  }
} satisfies ServiceSchema;

export default Migration230Schema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [Migration230Schema.name]: typeof Migration230Schema;
    }
  }
}
