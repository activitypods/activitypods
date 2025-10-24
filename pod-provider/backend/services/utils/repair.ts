// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import { arrayOf, getParentContainerUri } from '@semapps/ldp';
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
          // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
          ctx.meta.dataset = dataset;
          // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
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
          // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
          ctx.meta.dataset = dataset;
          // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
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
       * TODO: find existing optional access needs, and grant them also
       */
      async handler(ctx) {
        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { webId, username: dataset } of accounts) {
          // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
          ctx.meta.dataset = dataset;
          // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
          ctx.meta.webId = webId;

          const container = await ctx.call('applications.list', { webId });

          for (let application of arrayOf(container['ldp:contains'])) {
            this.logger.info(`Upgrading app ${application.id} for ${webId}...`);

            await ctx.call('registration-endpoint.upgrade', {
              appUri: application.id,
              acceptAllRequirements: true
            });
          }
        }
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
          // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
          ctx.meta.dataset = dataset;
          const storageUrl = await ctx.call('solid-storage.getBaseUrl', { webId });

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
          // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
          ctx.meta.dataset = dataset;
          // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
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
                  GRAPH ?objectUri {
                    ?objectUri <${attachPredicate}> ?collectionUri .
                    FILTER(ISURI(?objectUri))
                    FILTER(STRSTARTS(STR(?collectionUri), "${webId}"))
                  }            
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
          // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
          ctx.meta.dataset = dataset;
          // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
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
                    GRAPH <${profile.id}> {
                      <${profile.id}> <http://www.w3.org/2006/vcard/ns#given-name> ?s
                    }
                  }
                  INSERT {
                    GRAPH <${profile.id}> {
                      <${profile.id}> <http://www.w3.org/2006/vcard/ns#given-name> "${firstName}"
                    }
                  }
                  WHERE {
                    GRAPH <${profile.id}> {
                      <${profile.id}> <http://www.w3.org/2006/vcard/ns#given-name> ?s
                    }
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
                GRAPH ?s {
                  ?s ?p ?oldO .
                }
              }
              INSERT {
                GRAPH ?s {
                  ?s ?p ?newO .
                }
              }
              WHERE { 
                GRAPH ?s {
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
