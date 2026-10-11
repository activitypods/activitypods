import urlJoin from 'url-join';
import { arrayOf, getParentContainerUri } from '@semapps/ldp';
import { ACTIVITY_TYPES } from '@semapps/activitypub';
import rdf from '@rdfjs/data-model';
import { MIME_TYPES } from '@semapps/mime-types';
import { ServiceSchema } from 'moleculer';

/**
 * Service to repair Pods data
 */
const RepairSchema = {
  name: 'repair' as const,
  actions: {
    installApp: {
      /**
       * Install application with required access needs for the given users
       */
      async handler(ctx) {
        const { username, appUri } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { username: dataset, webId } of accounts) {
          ctx.meta.dataset = dataset;
          ctx.meta.webId = webId;

          const isRegistered = await ctx.call('app-registrations.isRegistered', { agentUri: appUri, podOwner: webId });
          if (isRegistered) {
            this.logger.info(`App ${appUri} is already installed for ${webId}, skipping...`);
          } else {
            this.logger.info(`Installing app ${appUri} on ${webId}...`);

            await ctx.call('registration-endpoint.register', {
              appUri,
              acceptAllRequirements: true
            });
          }
        }
      }
    },

    deleteAppRegistrations: {
      /**
       * Delete all app registrations for the given user
       */
      async handler(ctx) {
        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { webId, username: dataset } of accounts) {
          ctx.meta.dataset = dataset;
          ctx.meta.webId = webId;

          this.logger.info(`Removing apps of ${webId}...`);

          const container = await ctx.call('app-registrations.list', { webId });

          for (let appRegistration of arrayOf(container['ldp:contains'])) {
            this.logger.info(`Removing app ${appRegistration['interop:registeredAgent']}...`);

            await ctx.call('registration-endpoint.remove', { appUri: appRegistration['interop:registeredAgent'] });
          }
        }
      }
    },

    upgradeAllApps: {
      /**
       * Upgrade all existing applications, accepting all required access needs
       * Pass appUri (one URI or several, comma-separated) to only upgrade these applications.
       * An application that can't be upgraded (e.g. unreachable) is skipped, the others go on.
       * TODO: find existing optional access needs, and grant them also
       */
      async handler(ctx) {
        const { username, appUri } = ctx.params;
        const onlyAppsUris = appUri ? arrayOf(appUri).flatMap((uri: string) => uri.split(',')) : undefined;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        let upgraded = 0;
        const failed: string[] = [];

        for (const { webId, username: dataset, deletedAt } of accounts) {
          if (deletedAt) continue;

          ctx.meta.dataset = dataset;
          ctx.meta.webId = webId;

          const container = await ctx.call('applications.list', { webId });

          for (let application of arrayOf(container['ldp:contains'])) {
            if (onlyAppsUris && !onlyAppsUris.includes(application.id)) continue;

            this.logger.info(`Upgrading app ${application.id} for ${webId}...`);

            try {
              await ctx.call('registration-endpoint.upgrade', {
                appUri: application.id,
                acceptAllRequirements: true
              });
              upgraded++;
            } catch (e) {
              failed.push(`${application.id} (${webId})`);
              // @ts-expect-error TS(18046): 'e' is of type 'unknown'.
              this.logger.warn(`Unable to upgrade app ${application.id} for ${webId}. Error: ${e.message}`);
            }
          }
        }

        this.logger.info(
          `Apps upgrade finished: ${upgraded} upgraded, ${failed.length} failed${
            failed.length > 0 ? ` (${failed.join(', ')})` : ''
          }`
        );

        return { upgraded, failed };
      }
    },

    deleteLegacyGrants: {
      /**
       * Delete the AccessGrants and DataGrants of ActivityPods 2.1 (AccessGrants without interop:scopeOfGrant).
       * The app upgrade adds the new grants to the app registration, but leaves the old ones.
       * They are detached from the app registrations, which are sent to the apps with an Update.
       * They are deleted as system, without the hooks of the access-grants service: the permissions of
       * the apps are given by the new grants, and must not be removed.
       * Pass dryRun: true to only log what would be deleted.
       */
      async handler(ctx) {
        const { username, dryRun = false } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        let deletedGrants = 0;
        let deletedDataGrants = 0;
        const skipped: string[] = [];
        const failed: string[] = [];

        for (const { webId, username: dataset, deletedAt } of accounts) {
          if (deletedAt) continue;

          ctx.meta.dataset = dataset;
          ctx.meta.webId = webId;

          try {
            const grantsResults = await ctx.call('triplestore.query', {
              query: `
                PREFIX interop: <http://www.w3.org/ns/solid/interop#>
                SELECT ?grantUri ?registrationUri ?agentUri ?isApp
                WHERE {
                  ?grantUri a interop:AccessGrant ;
                    interop:grantedBy <${webId}> .
                  FILTER NOT EXISTS { ?grantUri interop:scopeOfGrant ?scope }
                  OPTIONAL {
                    ?registrationUri interop:hasAccessGrant ?grantUri ;
                      interop:registeredAgent ?agentUri .
                    BIND(EXISTS { ?registrationUri a interop:ApplicationRegistration } AS ?isApp)
                  }
                }
              `,
              accept: MIME_TYPES.JSON,
              webId: 'system',
              dataset
            });

            const dataGrantsResults = await ctx.call('triplestore.query', {
              query: `
                PREFIX interop: <http://www.w3.org/ns/solid/interop#>
                SELECT ?dataGrantUri
                WHERE {
                  ?dataGrantUri a interop:DataGrant ;
                    interop:dataOwner <${webId}> .
                }
              `,
              accept: MIME_TYPES.JSON,
              webId: 'system',
              dataset
            });

            const grantsUris = [...new Set<string>(grantsResults.map((r: any) => r.grantUri.value))];
            if (grantsUris.length === 0 && dataGrantsResults.length === 0) continue;

            // An app which has not been upgraded only has its legacy grants: don't leave it without any grant
            const notUpgradedResults = await ctx.call('triplestore.query', {
              query: `
                PREFIX interop: <http://www.w3.org/ns/solid/interop#>
                SELECT DISTINCT ?agentUri
                WHERE {
                  ?registrationUri a interop:ApplicationRegistration ;
                    interop:registeredAgent ?agentUri .
                  FILTER NOT EXISTS {
                    ?registrationUri interop:hasAccessGrant ?grantUri .
                    ?grantUri interop:scopeOfGrant ?scope .
                  }
                }
              `,
              accept: MIME_TYPES.JSON,
              webId: 'system',
              dataset
            });

            if (notUpgradedResults.length > 0) {
              skipped.push(webId);
              this.logger.warn(
                `Skipping ${webId}: apps not upgraded (${notUpgradedResults
                  .map((r: any) => r.agentUri.value)
                  .join(', ')}). Run repair.upgradeAllApps first.`
              );
              continue;
            }

            this.logger.info(
              `${dryRun ? '[dry run] ' : ''}Deleting ${grantsUris.length} legacy access grants and ${
                dataGrantsResults.length
              } data grants of ${webId}...`
            );

            if (dryRun) continue;

            // Detach the grants from the registrations. The patch is done directly on the resource, because
            // the hooks of the app-registrations service fetch the app, and would fail if it is offline.
            const registrations: Record<string, { agentUri: string; isApp: boolean; grantsUris: string[] }> = {};
            for (const { grantUri, registrationUri, agentUri, isApp } of grantsResults) {
              if (!registrationUri) continue;
              (registrations[registrationUri.value] ||= {
                agentUri: agentUri.value,
                isApp: isApp?.value === 'true',
                grantsUris: []
              }).grantsUris.push(grantUri.value);
            }

            for (const [registrationUri, { grantsUris: registrationGrantsUris }] of Object.entries(registrations)) {
              await ctx.call('ldp.resource.patch', {
                resourceUri: registrationUri,
                triplesToRemove: registrationGrantsUris.map(grantUri =>
                  rdf.quad(
                    rdf.namedNode(registrationUri),
                    rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAccessGrant'),
                    rdf.namedNode(grantUri)
                  )
                ),
                webId: 'system'
              });
            }

            for (const grantUri of grantsUris) {
              await ctx.call('ldp.resource.delete', { resourceUri: grantUri, webId: 'system' });
              deletedGrants++;
            }

            for (const { dataGrantUri } of dataGrantsResults) {
              await ctx.call('ldp.resource.delete', { resourceUri: dataGrantUri.value, webId: 'system' });
              deletedDataGrants++;
            }

            // Let the apps update their cache of the app registration
            for (const [registrationUri, { agentUri, isApp }] of Object.entries(registrations)) {
              if (!isApp) continue;
              try {
                const app = await ctx.call('ldp.remote.get', { resourceUri: agentUri, webId });
                if (app.inbox) {
                  await ctx.call('activitypub.outbox.post', {
                    collectionUri: urlJoin(webId, 'outbox'),
                    '@type': ACTIVITY_TYPES.UPDATE,
                    object: registrationUri,
                    to: agentUri
                  });
                }
              } catch (e) {
                // @ts-expect-error TS(18046): 'e' is of type 'unknown'.
                this.logger.warn(`Could not notify app ${agentUri} for ${webId}. Error: ${e.message}`);
              }
            }
          } catch (e) {
            failed.push(webId);
            // @ts-expect-error TS(18046): 'e' is of type 'unknown'.
            this.logger.warn(`Unable to delete the legacy grants of ${webId}. Error: ${e.message}`);
          }
        }

        this.logger.info(
          `Legacy grants deletion finished: ${deletedGrants} access grants and ${deletedDataGrants} data grants deleted, ${
            skipped.length
          } skipped${skipped.length > 0 ? ` (${skipped.join(', ')})` : ''}, ${failed.length} failed${
            failed.length > 0 ? ` (${failed.join(', ')})` : ''
          }`
        );

        return { deletedGrants, deletedDataGrants, skipped, failed };
      }
    },

    createMissingContainers: {
      /**
       * Create missing containers for the given user
       */
      async handler(ctx) {
        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { webId, username: dataset } of accounts) {
          ctx.meta.dataset = dataset;
          const storageUrl = await ctx.call('solid-storage.getUrl', { webId });

          const registeredContainers = await ctx.call('ldp.registry.list');
          for (const container of Object.values(registeredContainers)) {
            // @ts-expect-error TS(18046): 'container' is of type 'unknown'.
            const containerUri = urlJoin(storageUrl, container.path);
            const containerExist = await ctx.call('ldp.container.exist', { containerUri });
            if (!containerExist) {
              this.logger.info(`Container ${containerUri} doesn't exist yet. Creating it...`);
              await ctx.call('ldp.container.createAndAttach', {
                containerUri,
                // @ts-expect-error TS(18046): 'container' is of type 'unknown'.
                permissions: container.permissions,
                webId
              });
            }
          }
        }
      }
    },

    attachAllContainersToParent: {
      /**
       * Ensure there is no orphan container
       */
      async handler(ctx) {
        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { webId, username: dataset } of accounts) {
          ctx.meta.dataset = dataset;
          ctx.meta.webId = webId;

          this.logger.info(`Attaching all containers of ${webId}...`);

          const containersUris = await ctx.call('ldp.container.getAll', { dataset });

          for (const containerUri of containersUris) {
            // Ignore root container
            if (containerUri !== urlJoin(webId, 'data')) {
              const parentContainerUri = getParentContainerUri(containerUri);

              this.logger.info(`Attaching ${containerUri} to ${parentContainerUri}...`);

              await ctx.call('ldp.container.attach', {
                containerUri: parentContainerUri,
                resourceUri: containerUri,
                webId: 'system'
              });
            }
          }
        }
      }
    },

    deleteEmptyCollections: {
      async handler(ctx) {
        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { webId, username: dataset } of accounts) {
          ctx.meta.dataset = dataset;
          ctx.meta.webId = webId;

          // Collections which are now created on the fly
          const attachPredicates = ['likes', 'replies'];

          for (let attachPredicate of attachPredicates) {
            attachPredicate = await ctx.call('jsonld.parser.expandPredicate', { predicate: attachPredicate });

            this.logger.info(
              `Getting all collections in dataset ${dataset} attached with predicate ${attachPredicate}...`
            );

            const results = await ctx.call('triplestore.query', {
              query: `
              SELECT ?objectUri ?collectionUri
              WHERE {
                ?objectUri <${attachPredicate}> ?collectionUri .
                FILTER (isuri(?objectUri))
                FILTER (strstarts(str(?collectionUri), "${webId}"))
              }
            `,
              accept: MIME_TYPES.JSON,
              webId: 'system',
              dataset
            });

            for (const [objectUri, collectionUri] of results.map((r: any) => [
              r.objectUri.value,
              r.collectionUri.value
            ])) {
              const isEmpty = await ctx.call('activitypub.collection.isEmpty', { collectionUri });
              if (isEmpty) {
                const exist = await ctx.call('ldp.resource.exist', { resourceUri: collectionUri, webId: 'system' });
                if (exist) {
                  this.logger.info(`Collection ${collectionUri} is empty, deleting it...`);
                  await ctx.call('ldp.resource.delete', { resourceUri: collectionUri, webId: 'system' });
                }
                await ctx.call('ldp.resource.patch', {
                  resourceUri: objectUri,
                  triplesToRemove: [
                    rdf.quad(rdf.namedNode(objectUri), rdf.namedNode(attachPredicate), rdf.namedNode(collectionUri))
                  ],
                  webId: 'system'
                });
              }
            }
          }
        }
      }
    },

    deleteDoubleNameFromProfiles: {
      async handler(ctx) {
        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { webId, username: dataset } of accounts) {
          this.logger.info(`Inspecting Pod of ${webId}...`);
          ctx.meta.dataset = dataset;
          ctx.meta.webId = webId;

          const container = await ctx.call('profiles.profile.list');

          for (const profile of container['ldp:contains']) {
            if (profile['vcard:given-name'] && Array.isArray(profile['vcard:given-name'])) {
              this.logger.info(
                `Found an array in profile name (${profile['vcard:given-name'].join(', ')}) ! Deleting it from ${profile.id}`
              );
              const firstName = profile['vcard:given-name'][0];
              await ctx.call('triplestore.update', {
                query: `
                  DELETE {
                    <${profile.id}> <http://www.w3.org/2006/vcard/ns#given-name> ?s
                  }
                  INSERT {
                    <${profile.id}> <http://www.w3.org/2006/vcard/ns#given-name> "${firstName}"
                  }
                  WHERE {
                    <${profile.id}> <http://www.w3.org/2006/vcard/ns#given-name> ?s
                  }
                `,
                webId: 'system',
                dataset
              });
            }
          }
        }
      }
    },

    changeBaseUrl: {
      async handler(ctx) {
        const { username, oldBaseUrl, newBaseUrl } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { username: dataset } of accounts) {
          this.logger.info(`Changing base URL for dataset ${dataset}...`);

          await ctx.call('triplestore.update', {
            query: `
              DELETE {
                ?s ?p ?oldO .
              }
              INSERT {
                ?s ?p ?newO .
              }
              WHERE 
              { 
                ?s ?p ?oldO .
                FILTER(REGEX(STR(?oldO), "${oldBaseUrl}", "i"))
                BIND(URI(REPLACE(STR(?oldO), "${oldBaseUrl}", "${newBaseUrl}", "i")) AS ?newO)
              }
            `,
            dataset,
            webId: 'system'
          });

          await ctx.call('triplestore.update', {
            query: `
              DELETE {
                ?oldS ?p ?o .
              }
              INSERT {
                ?newS ?p ?o .
              }
              WHERE 
              { 
                ?oldS ?p ?o .
                FILTER(REGEX(STR(?oldS), "${oldBaseUrl}", "i"))
                BIND(URI(REPLACE(STR(?oldS), "${oldBaseUrl}", "${newBaseUrl}", "i")) AS ?newS)
              }
            `,
            dataset,
            webId: 'system'
          });

          await ctx.call('triplestore.update', {
            query: `
              DELETE {
                GRAPH <http://semapps.org/webacl> { 
                  ?s ?p ?oldO . 
                }
              }
              INSERT {
                GRAPH <http://semapps.org/webacl> { 
                  ?s ?p ?newO .
                }
              }
              WHERE 
              { 
                GRAPH <http://semapps.org/webacl> { 
                  ?s ?p ?oldO .
                  FILTER(REGEX(STR(?oldO), "${oldBaseUrl}", "i"))
                  BIND(URI(REPLACE(STR(?oldO), "${oldBaseUrl}", "${newBaseUrl}", "i")) AS ?newO)
                }
              }
            `,
            dataset,
            webId: 'system'
          });

          await ctx.call('triplestore.update', {
            query: `
              DELETE {
                GRAPH <http://semapps.org/webacl> { 
                  ?oldS ?p ?o .
                }
              }
              INSERT {
                GRAPH <http://semapps.org/webacl> { 
                  ?newS ?p ?o .
                }
              }
              WHERE 
              { 
                GRAPH <http://semapps.org/webacl> { 
                  ?oldS ?p ?o .
                  FILTER(REGEX(STR(?oldS), "${oldBaseUrl}", "i"))
                  BIND(URI(REPLACE(STR(?oldS), "${oldBaseUrl}", "${newBaseUrl}", "i")) AS ?newS)
                }
              }
            `,
            dataset,
            webId: 'system'
          });
        }
      }
    },
    async removeDeletedResourcesFromCache(ctx) {
      const { username, containerPath } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      let deletedResources = [];

      for (const { webId, username: dataset } of accounts) {
        this.logger.info(`Inspecting Pod of ${webId}...`);
        ctx.meta.dataset = dataset;
        ctx.meta.webId = webId;

        const containerUri = urlJoin(webId, 'data', containerPath);
        const resourcesUris = await ctx.call('ldp.container.getUris', { containerUri });

        for (const resourceUri of resourcesUris) {
          // If this is a cached resource...
          if (!resourceUri.startsWith(urlJoin(webId, 'data'))) {
            try {
              const remoteResource = await ctx.call('ldp.remote.getNetwork', { resourceUri });
              if (remoteResource.type === 'Tombstone') {
                this.logger.info(`Resource ${resourceUri} has been deleted, removing from cache...`);
                await ctx.call('ldp.remote.delete', { resourceUri });
                deletedResources.push(resourceUri);
              }
            } catch (e) {
              if (e?.code === 404) {
                this.logger.info(`Resource ${resourceUri} has been deleted, removing from cache...`);
                try {
                  await ctx.call('ldp.remote.delete', { resourceUri });
                  deletedResources.push(resourceUri);
                } catch (e) {
                  console.error(e);
                }
              }
            }
          }
        }
      }

      return deletedResources;
    }
  }
} satisfies ServiceSchema;

export default RepairSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [RepairSchema.name]: typeof RepairSchema;
    }
  }
}
