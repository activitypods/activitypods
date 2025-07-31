// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { arrayOf, getParentContainerUri } from '@semapps/ldp';
import { triple, namedNode } from '@rdfjs/data-model';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { MIME_TYPES } from '@semapps/mime-types';
import { ServiceSchema, defineAction } from 'moleculer';

/**
 * Service to repair Pods data
 */
const RepairServiceSchema = {
  name: 'repair' as const,

  actions: {
    installApp: defineAction({
      /**
       * Install application with required access needs for the given users
       */
      async handler(ctx: any) {
        const { username, appUri } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { username: dataset, webId } of accounts) {
          ctx.meta.dataset = dataset;
          ctx.meta.webId = webId;

          const isRegistered = await ctx.call('app-registrations.isRegistered', { appUri, podOwner: webId });
          if (isRegistered) {
            // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ instal... Remove this comment to see the full error message
            this.logger.info(`App ${appUri} is already installed for ${webId}, skipping...`);
          } else {
            // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ instal... Remove this comment to see the full error message
            this.logger.info(`Installing app ${appUri} on ${webId}...`);

            await ctx.call(
              'auth-agent.registerApp',
              {
                appUri,
                acceptAllRequirements: true
              },
              { meta: { webId } }
            );
          }
        }
      }
    }),

    deleteAppRegistrations: defineAction({
      /**
       * Delete all app registrations for the given user
       */
      async handler(ctx: any) {
        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { webId, username: dataset } of accounts) {
          ctx.meta.dataset = dataset;
          ctx.meta.webId = webId;

          // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ instal... Remove this comment to see the full error message
          this.logger.info(`Deleting app registrations of ${webId}...`);

          const container = await ctx.call('app-registrations.list', { webId });

          for (let appRegistration of arrayOf(container['ldp:contains'])) {
            // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ instal... Remove this comment to see the full error message
            this.logger.info(`Deleting app ${appRegistration['interop:registeredAgent']}...`);
            await ctx.call('app-registrations.delete', { resourceUri: appRegistration.id, webId });
          }
        }
      }
    }),

    upgradeAllApps: defineAction({
      /**
       * Upgrade all existing applications, accepting all required access needs
       * TODO: find existing optional access needs, and grant them also
       */
      async handler(ctx: any) {
        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { webId } of accounts) {
          const container = await ctx.call('applications.list', { webId });

          for (let application of arrayOf(container['ldp:contains'])) {
            // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ instal... Remove this comment to see the full error message
            this.logger.info(`Upgrading app ${application.id} for ${webId}...`);

            await ctx.call(
              'auth-agent.upgradeApp',
              {
                appUri: application.id,
                acceptAllRequirements: true
              },
              { meta: { webId } }
            );
          }
        }
      }
    }),

    createMissingContainers: defineAction({
      /**
       * Create missing containers for the given user
       */
      async handler(ctx: any) {
        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { webId, username: dataset } of accounts) {
          ctx.meta.dataset = dataset;
          const storageUrl = await ctx.call('solid-storage.getUrl', { webId });

          const registeredContainers = await ctx.call('ldp.registry.list');
          for (const container of Object.values(registeredContainers)) {
            // @ts-expect-error TS(2571): Object is of type 'unknown'.
            const containerUri = urlJoin(storageUrl, container.path);
            const containerExist = await ctx.call('ldp.container.exist', { containerUri, webId });
            if (!containerExist) {
              // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ instal... Remove this comment to see the full error message
              this.logger.info(`Container ${containerUri} doesn't exist yet. Creating it...`);
              await ctx.call('ldp.container.createAndAttach', {
                containerUri,
                // @ts-expect-error TS(2571): Object is of type 'unknown'.
                permissions: container.permissions,
                webId
              });
            }
          }
        }
      }
    }),

    attachAllContainersToParent: defineAction({
      /**
       * Ensure there is no orphan container
       */
      async handler(ctx: any) {
        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { webId, username: dataset } of accounts) {
          ctx.meta.dataset = dataset;
          ctx.meta.webId = webId;

          // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ instal... Remove this comment to see the full error message
          this.logger.info(`Attaching all containers of ${webId}...`);

          const containersUris = await ctx.call('ldp.container.getAll', { dataset });

          for (const containerUri of containersUris) {
            // Ignore root container
            if (containerUri !== urlJoin(webId, 'data')) {
              const parentContainerUri = getParentContainerUri(containerUri);

              // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ instal... Remove this comment to see the full error message
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
    }),

    deleteEmptyCollections: defineAction({
      async handler(ctx: any) {
        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { webId, username: dataset } of accounts) {
          ctx.meta.dataset = dataset;
          ctx.meta.webId = webId;

          // Collections which are now created on the fly
          const attachPredicates = ['likes', 'replies'];

          for (let attachPredicate of attachPredicates) {
            attachPredicate = await ctx.call('jsonld.parser.expandPredicate', { predicate: attachPredicate });

            // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ instal... Remove this comment to see the full error message
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
                  // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ instal... Remove this comment to see the full error message
                  this.logger.info(`Collection ${collectionUri} is empty, deleting it...`);
                  await ctx.call('ldp.resource.delete', { resourceUri: collectionUri, webId: 'system' });
                }
                await ctx.call('ldp.resource.patch', {
                  resourceUri: objectUri,
                  triplesToRemove: [triple(namedNode(objectUri), namedNode(attachPredicate), namedNode(collectionUri))],
                  webId: 'system'
                });
              }
            }
          }
        }
      }
    }),

    deleteDoubleNameFromProfiles: defineAction({
      async handler(ctx: any) {
        const { username } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { webId, username: dataset } of accounts) {
          // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ instal... Remove this comment to see the full error message
          this.logger.info(`Inspecting Pod of ${webId}...`);
          ctx.meta.dataset = dataset;
          ctx.meta.webId = webId;

          const container = await ctx.call('profiles.profile.list');

          for (const profile of container['ldp:contains']) {
            if (profile['vcard:given-name'] && Array.isArray(profile['vcard:given-name'])) {
              // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ instal... Remove this comment to see the full error message
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
    }),

    changeBaseUrl: defineAction({
      async handler(ctx: any) {
        const { username, oldBaseUrl, newBaseUrl } = ctx.params;
        const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

        for (const { username: dataset } of accounts) {
          // @ts-expect-error TS(2339): Property 'logger' does not exist on type '{ instal... Remove this comment to see the full error message
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
    })
  }
} satisfies ServiceSchema;

export default RepairServiceSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [RepairServiceSchema.name]: typeof RepairServiceSchema;
    }
  }
}
