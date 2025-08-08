// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import { triple, namedNode, literal } from '@rdfjs/data-model';
import { arrayOf } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';
// @ts-expect-error TS(6059): File '/home/laurin/projects/virtual-assembly/semap... Remove this comment to see the full error message
import { MigrationService } from '@semapps/migration';
// @ts-expect-error TS(1192): Module '"/home/laurin/projects/virtual-assembly/ac... Remove this comment to see the full error message
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema, defineAction } from 'moleculer';

const Migration200Schema = {
  name: 'migration-2-0-0' as const,
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

        for (let account of accounts) {
          if (account.version === '2.0.0') {
            this.logger.info(`Pod of ${account.webId} is already on v2, skipping...`);
          } else {
            this.logger.info(`Migrating Pod of ${account.webId}...`);

            // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
            ctx.meta.dataset = account.username;
            // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
            ctx.meta.webId = account.webId;
            // @ts-expect-error TS(2339): Property 'skipObjectsWatcher' does not exist on ty... Remove this comment to see the full error message
            ctx.meta.skipObjectsWatcher = true; // We don't want to trigger an Update

            // WebID
            await this.actions.migratePreferredLocale(account, { parentCtx: ctx });
            await this.actions.addSolidPredicates(account, { parentCtx: ctx });
            await this.actions.addTypeIndex(account, { parentCtx: ctx });

            // Collections
            await this.actions.attachCollectionsToContainer(account, { parentCtx: ctx });
            await this.actions.persistCollectionsOptions(account, { parentCtx: ctx });

            // Containers
            await this.actions.createNewContainers(account, { parentCtx: ctx });
            await this.actions.attachResourcesToNewContainers(account, { parentCtx: ctx });
            await this.actions.deleteUnusedContainers(account, { parentCtx: ctx });

            // Apps
            await this.actions.useNewMutualAidNamespace(account, { parentCtx: ctx });

            await ctx.call('auth.account.update', {
              id: account['@id'],
              ...account,
              version: '2.0.0'
            });
          }
        }
      }
    }),

    migratePreferredLocale: defineAction({
      async handler(ctx) {
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
            id: account['@id'],
            ...account,
            preferredLocale: undefined
          });
          this.logger.info('DONE');
        } else {
          this.logger.warn(`No preferred locale found`);
        }
      }
    }),

    addSolidPredicates: defineAction({
      async handler(ctx) {
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
            id: account['@id'],
            ...account,
            podUri: undefined
          });

          this.logger.info(`DONE`);
        } else {
          this.logger.warn(`No pod URI found for ${account.webId}`);
        }
      }
    }),

    addTypeIndex: defineAction({
      async handler(ctx) {
        const { webId } = ctx.params;
        const webIdData = await ctx.call('ldp.resource.get', { resourceUri: webId, accept: MIME_TYPES.JSON, webId });

        if (webIdData['solid:publicTypeIndex']) {
          this.logger.warn(`Skipping TypeIndex as it is already attached to ${webId}...`);
        } else {
          this.logger.info(`Adding TypeIndex to ${webId}...`);

          const podUrl = await ctx.call('solid-storage.getUrl', { webId });
          await ctx.call('type-indexes.createPublicIndex', { webId });

          // Go through each registered container and persist them
          const registeredContainers = await ctx.call('ldp.registry.list');
          for (const container of Object.values(registeredContainers)) {
            // @ts-expect-error TS(18046): 'container' is of type 'unknown'.
            const containerUri = urlJoin(podUrl, container.path);
            await ctx.call('type-registrations.register', {
              // @ts-expect-error TS(18046): 'container' is of type 'unknown'.
              types: arrayOf(container.acceptedTypes),
              containerUri,
              webId
            });
          }
        }
      }
    }),

    attachCollectionsToContainer: defineAction({
      async handler(ctx) {
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
      }
    }),

    persistCollectionsOptions: defineAction({
      async handler(ctx) {
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
      }
    }),

    createNewContainers: defineAction({
      async handler(ctx) {
        const { webId, username: dataset } = ctx.params;
        const podUrl = await ctx.call('solid-storage.getUrl', { webId });

        // Go through each registered containers, create and attach it
        const registeredContainers = await ctx.call('ldp.registry.list', { dataset });
        for (const container of Object.values(registeredContainers)) {
          // @ts-expect-error TS(18046): 'container' is of type 'unknown'.
          if (!container.podsContainer) {
            // @ts-expect-error TS(18046): 'container' is of type 'unknown'.
            const containerUri = urlJoin(podUrl, container.path);
            this.logger.info(`Creating new container ${containerUri}`);
            await ctx.call('ldp.container.createAndAttach', {
              containerUri,
              // @ts-expect-error TS(18046): 'container' is of type 'unknown'.
              permissions: container.permissions,
              webId
            });
          }
        }

        // App containers (they are not registered yet, but create them before the apps installation)
        const appContainersPaths = ['/as/event', '/maid/offer', '/maid/request'];
        for (const appContainerPath of appContainersPaths) {
          const appContainerUri = urlJoin(podUrl, appContainerPath);
          this.logger.info(`Creating new app container ${appContainerUri}`);
          await ctx.call('ldp.container.createAndAttach', { containerUri: appContainerUri, webId });
        }
      }
    }),

    attachResourcesToNewContainers: defineAction({
      async handler(ctx) {
        const { webId } = ctx.params;

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

          const resourcesUris = await ctx.call('ldp.container.getUris', { containerUri: oldContainerUri });

          for (const resourceUri of resourcesUris) {
            try {
              await ctx.call('ldp.container.attach', {
                containerUri: newContainerUri,
                resourceUri,
                webId: 'system'
              });

              await ctx.call('ldp.container.detach', {
                containerUri: oldContainerUri,
                resourceUri,
                webId: 'system'
              });
            } catch (e) {
              this.logger.warn(
                // @ts-expect-error TS(18046): 'e' is of type 'unknown'.
                `Could not attach ${resourceUri} to new container ${newContainerUri}. Error: ${e.message}`
              );
            }
          }

          const isEmpty = await ctx.call('ldp.container.isEmpty', { containerUri: oldContainerUri, webId });

          if (isEmpty) {
            this.logger.info(`Deleting empty container ${oldContainerUri}`);
            await ctx.call('ldp.container.delete', { containerUri: oldContainerUri, webId });
          } else {
            this.logger.warn(`Cannot delete old container ${oldContainerUri} as it is not empty`);
          }
        }
      }
    }),

    deleteUnusedContainers: defineAction({
      async handler(ctx) {
        const { webId } = ctx.params;

        // Containers which are not used anymore in v2
        const unusedContainersPaths = [
          '/projects',
          '/skills',
          '/syreen/offers',
          '/syreen/projects',
          '/syreen',
          '/front-apps'
        ];

        // Prevent tombstones to be created
        // @ts-expect-error TS(2339): Property 'activateTombstones' does not exist on ty... Remove this comment to see the full error message
        ctx.meta.activateTombstones = false;

        for (const unusedContainerPath of unusedContainersPaths) {
          const unusedContainerUri = urlJoin(webId, 'data', unusedContainerPath);
          this.logger.info(`Deleting unused container ${unusedContainerUri}`);
          try {
            // Use the webId of the Pod owner in case we need to delete a remote resource (webId is mandatory)
            await ctx.call('ldp.container.clear', { containerUri: unusedContainerUri, webId });
            await ctx.call('ldp.container.delete', { containerUri: unusedContainerUri, webId: 'system' });
          } catch (e) {
            this.logger.error(`Could not delete unused container ${unusedContainerUri}. Error:`, e);
          }
        }
      }
    }),

    useNewMutualAidNamespace: defineAction({
      async handler(ctx) {
        const { username: dataset } = ctx.params;

        const types = [
          'GiftOffer',
          'BarterOffer',
          'LoanOffer',
          'SaleOffer',
          'Offer',
          'GiftRequest',
          'BarterRequest',
          'LoanRequest',
          'PurchaseRequest',
          'Request'
        ];

        for (const type of types) {
          await ctx.call('triplestore.update', {
            query: `
              DELETE { ?s a <http://virtual-assembly.org/ontologies/pair-mp#${type}> . }
              INSERT { ?s a <https://mutual-aid.app/ns/core#${type}> . }
              WHERE { ?s a <http://virtual-assembly.org/ontologies/pair-mp#${type}> . }
            `,
            dataset,
            webId: 'system'
          });
        }

        const predicates = [
          'offerOfResourceType',
          'requestOfResourceType',
          'hasGeoCondition',
          'hasTimeCondition',
          'hasReciprocityCondition',
          'amount',
          'maxAmount',
          'currency',
          'inExchangeOf',
          'maxDuration',
          'minDuration',
          'expirationDate'
        ];

        for (const predicate of predicates) {
          await this.actions.replacePredicate({
            oldPredicate: `http://virtual-assembly.org/ontologies/pair-mp#${predicate}`,
            newPredicate: `https://mutual-aid.app/ns/core#${predicate}`,
            dataset
          });
        }
      }
    }),

    migrateMutualAidData: defineAction({
      async handler(ctx) {
        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (let { username: dataset } of accounts) {
          await ctx.call('triplestore.update', {
            query: `
              PREFIX maid: <https://mutual-aid.app/ns/core#>
              PREFIX pair: <http://virtual-assembly.org/ontologies/pair#>
              DELETE { 
                ?s a ?type . 
              }
              INSERT { 
                ?s a maid:Offer . 
                ?s pair:hasType ?type
              }
              WHERE { 
                VALUES ?type { maid:GiftOffer maid:BarterOffer maid:LoanOffer maid:SaleOffer maid:Offer } .
                ?s a ?type . 
              }
            `,
            dataset,
            webId: 'system'
          });

          // Prevent maid:Offer to be in the pair:hasType
          await ctx.call('triplestore.update', {
            query: `
              PREFIX maid: <https://mutual-aid.app/ns/core#>
              PREFIX pair: <http://virtual-assembly.org/ontologies/pair#>
              DELETE 
              WHERE { 
                ?s pair:hasType maid:Offer
              }
            `,
            dataset,
            webId: 'system'
          });

          await ctx.call('triplestore.update', {
            query: `
              PREFIX maid: <https://mutual-aid.app/ns/core#>
              PREFIX pair: <http://virtual-assembly.org/ontologies/pair#>
              DELETE { 
                ?s a ?type . 
              }
              INSERT { 
                ?s a maid:Request . 
                ?s pair:hasType ?type
              }
              WHERE { 
                VALUES ?type { maid:GiftRequest maid:BarterRequest maid:LoanRequest maid:PurchaseRequest maid:Request } .
                ?s a ?type . 
              }
            `,
            dataset,
            webId: 'system'
          });

          // Prevent maid:Request to be in the pair:hasType
          await ctx.call('triplestore.update', {
            query: `
              PREFIX maid: <https://mutual-aid.app/ns/core#>
              PREFIX pair: <http://virtual-assembly.org/ontologies/pair#>
              DELETE 
              WHERE { 
                ?s pair:hasType maid:Request
              }
            `,
            dataset,
            webId: 'system'
          });
        }
      }
    }),

    migrateWtmpEventsFormats: defineAction({
      async handler(ctx) {
        // https://data.welcometomyplace.org/formats/music -> https://welcometomyplace.org/api/music

        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { username: dataset } of accounts) {
          await ctx.call('triplestore.update', {
            query: `
              PREFIX apods: <http://activitypods.org/ns/core#>
              DELETE {
                ?s apods:hasFormat ?format .
              }
              INSERT {
                ?s apods:hasFormat ?newFormat .
              }
              WHERE 
              { 
                ?s apods:hasFormat ?format .
                FILTER(REGEX(STR(?format), "https://data.welcometomyplace.org/formats", "i"))
                BIND(URI(REPLACE(STR(?format), "https://data.welcometomyplace.org/formats", "https://welcometomyplace.org/api", "i")) AS ?newFormat)
              }
            `,
            dataset,
            webId: 'system'
          });
        }
      }
    }),

    migrateBcmEventsFormats: defineAction({
      async handler(ctx) {
        // https://data.bienvenuechezmoi.org/formats/music -> https://bienvenuechezmoi.org/api/music

        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { username: dataset } of accounts) {
          await ctx.call('triplestore.update', {
            query: `
              PREFIX apods: <http://activitypods.org/ns/core#>
              DELETE {
                ?s apods:hasFormat ?format .
              }
              INSERT {
                ?s apods:hasFormat ?newFormat .
              }
              WHERE 
              { 
                ?s apods:hasFormat ?format .
                FILTER(REGEX(STR(?format), "https://data.bienvenuechezmoi.org/formats", "i"))
                BIND(URI(REPLACE(STR(?format), "https://data.bienvenuechezmoi.org/formats", "https://bienvenuechezmoi.org/api", "i")) AS ?newFormat)
              }
            `,
            dataset,
            webId: 'system'
          });
        }
      }
    })
  }
} satisfies ServiceSchema;

export default Migration200Schema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [Migration200Schema.name]: typeof Migration200Schema;
    }
  }
}
