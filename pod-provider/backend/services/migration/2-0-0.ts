// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import { triple, namedNode, literal } from '@rdfjs/data-model';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { arrayOf } from '@semapps/ldp';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { MIME_TYPES } from '@semapps/mime-types';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { MigrationService } from '@semapps/migration';
// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../../config/config.ts';

export default {
  name: 'migration-2-0-0',
  mixins: [MigrationService],
  settings: {
    baseUrl: CONFIG.BASE_URL
  },
  actions: {
    async migrate(ctx: any) {
      const { username } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      for (let account of accounts) {
        if (account.version === '2.0.0') {
          // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
          this.logger.info(`Pod of ${account.webId} is already on v2, skipping...`);
        } else {
          // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
          this.logger.info(`Migrating Pod of ${account.webId}...`);

          ctx.meta.dataset = account.username;
          ctx.meta.webId = account.webId;
          ctx.meta.skipObjectsWatcher = true; // We don't want to trigger an Update

          // WebID
          // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ migra... Remove this comment to see the full error message
          await this.actions.migratePreferredLocale(account, { parentCtx: ctx });
          // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ migra... Remove this comment to see the full error message
          await this.actions.addSolidPredicates(account, { parentCtx: ctx });
          // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ migra... Remove this comment to see the full error message
          await this.actions.addTypeIndex(account, { parentCtx: ctx });

          // Collections
          // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ migra... Remove this comment to see the full error message
          await this.actions.attachCollectionsToContainer(account, { parentCtx: ctx });
          // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ migra... Remove this comment to see the full error message
          await this.actions.persistCollectionsOptions(account, { parentCtx: ctx });

          // Containers
          // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ migra... Remove this comment to see the full error message
          await this.actions.createNewContainers(account, { parentCtx: ctx });
          // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ migra... Remove this comment to see the full error message
          await this.actions.attachResourcesToNewContainers(account, { parentCtx: ctx });
          // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ migra... Remove this comment to see the full error message
          await this.actions.deleteUnusedContainers(account, { parentCtx: ctx });

          // Apps
          // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ migra... Remove this comment to see the full error message
          await this.actions.useNewMutualAidNamespace(account, { parentCtx: ctx });

          await ctx.call('auth.account.update', {
            id: account['@id'],
            ...account,
            version: '2.0.0'
          });
        }
      }
    },
    async migratePreferredLocale(ctx: any) {
      const account = ctx.params;
      // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
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
        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
        this.logger.info('DONE');
      } else {
        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
        this.logger.warn(`No preferred locale found`);
      }
    },
    async addSolidPredicates(ctx: any) {
      const account = ctx.params;
      // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
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

        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
        this.logger.info(`DONE`);
      } else {
        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
        this.logger.warn(`No pod URI found for ${account.webId}`);
      }
    },
    async addTypeIndex(ctx: any) {
      const { webId } = ctx.params;
      const webIdData = await ctx.call('ldp.resource.get', { resourceUri: webId, accept: MIME_TYPES.JSON, webId });

      if (webIdData['solid:publicTypeIndex']) {
        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
        this.logger.warn(`Skipping TypeIndex as it is already attached to ${webId}...`);
      } else {
        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
        this.logger.info(`Adding TypeIndex to ${webId}...`);

        const podUrl = await ctx.call('solid-storage.getUrl', { webId });
        await ctx.call('type-indexes.createPublicIndex', { webId });

        // Go through each registered container and persist them
        const registeredContainers = await ctx.call('ldp.registry.list');
        for (const container of Object.values(registeredContainers)) {
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          const containerUri = urlJoin(podUrl, container.path);
          await ctx.call('type-registrations.register', {
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            types: arrayOf(container.acceptedTypes),
            containerUri,
            webId
          });
        }
      }
    },
    async attachCollectionsToContainer(ctx: any) {
      const { username: dataset } = ctx.params;

      const collectionsContainerUri = urlJoin(CONFIG.BASE_URL, dataset, '/data/as/collection');

      // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
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
    async persistCollectionsOptions(ctx: any) {
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
    async createNewContainers(ctx: any) {
      const { webId, username: dataset } = ctx.params;
      const podUrl = await ctx.call('solid-storage.getUrl', { webId });

      // Go through each registered containers, create and attach it
      const registeredContainers = await ctx.call('ldp.registry.list', { dataset });
      for (const container of Object.values(registeredContainers)) {
        // @ts-expect-error TS(2571): Object is of type 'unknown'.
        if (!container.podsContainer) {
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          const containerUri = urlJoin(podUrl, container.path);
          // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
          this.logger.info(`Creating new container ${containerUri}`);
          // @ts-expect-error TS(2571): Object is of type 'unknown'.
          await ctx.call('ldp.container.createAndAttach', { containerUri, permissions: container.permissions, webId });
        }
      }

      // App containers (they are not registered yet, but create them before the apps installation)
      const appContainersPaths = ['/as/event', '/maid/offer', '/maid/request'];
      for (const appContainerPath of appContainersPaths) {
        const appContainerUri = urlJoin(podUrl, appContainerPath);
        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
        this.logger.info(`Creating new app container ${appContainerUri}`);
        await ctx.call('ldp.container.createAndAttach', { containerUri: appContainerUri, webId });
      }
    },
    async attachResourcesToNewContainers(ctx: any) {
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

        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
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
            // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
            this.logger.warn(
              // @ts-expect-error TS(2571): Object is of type 'unknown'.
              `Could not attach ${resourceUri} to new container ${newContainerUri}. Error: ${e.message}`
            );
          }
        }

        const isEmpty = await ctx.call('ldp.container.isEmpty', { containerUri: oldContainerUri, webId });

        if (isEmpty) {
          // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
          this.logger.info(`Deleting empty container ${oldContainerUri}`);
          await ctx.call('ldp.container.delete', { containerUri: oldContainerUri, webId });
        } else {
          // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
          this.logger.warn(`Cannot delete old container ${oldContainerUri} as it is not empty`);
        }
      }
    },
    async deleteUnusedContainers(ctx: any) {
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
      ctx.meta.activateTombstones = false;

      for (const unusedContainerPath of unusedContainersPaths) {
        const unusedContainerUri = urlJoin(webId, 'data', unusedContainerPath);
        // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
        this.logger.info(`Deleting unused container ${unusedContainerUri}`);
        try {
          // Use the webId of the Pod owner in case we need to delete a remote resource (webId is mandatory)
          await ctx.call('ldp.container.clear', { containerUri: unusedContainerUri, webId });
          await ctx.call('ldp.container.delete', { containerUri: unusedContainerUri, webId: 'system' });
        } catch (e) {
          // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ migrat... Remove this comment to see the full error message
          this.logger.error(`Could not delete unused container ${unusedContainerUri}. Error:`, e);
        }
      }
    },
    async useNewMutualAidNamespace(ctx: any) {
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
        // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ migra... Remove this comment to see the full error message
        await this.actions.replacePredicate({
          oldPredicate: `http://virtual-assembly.org/ontologies/pair-mp#${predicate}`,
          newPredicate: `https://mutual-aid.app/ns/core#${predicate}`,
          dataset
        });
      }
    },
    async migrateMutualAidData(ctx: any) {
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
    },
    async migrateWtmpEventsFormats(ctx: any) {
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
    },
    async migrateBcmEventsFormats(ctx: any) {
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
  }
};
