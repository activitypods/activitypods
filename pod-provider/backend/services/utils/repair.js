const urlJoin = require('url-join');
const { arrayOf, getParentContainerUri } = require('@semapps/ldp');
const { triple, namedNode } = require('@rdfjs/data-model');
const { MIME_TYPES } = require('@semapps/mime-types');

/**
 * Service to repair Pods data
 */
module.exports = {
  name: 'repair',
  actions: {
    /**
     * Install application with required access needs for the given users
     */
    async installApp(ctx) {
      const { username, appUri } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      for (const { username: dataset, webId } of accounts) {
        ctx.meta.dataset = dataset;
        ctx.meta.webId = webId;

        const isRegistered = await ctx.call('app-registrations.isRegistered', { appUri, podOwner: webId });
        if (isRegistered) {
          this.logger.info(`App is already installed for ${webId}, skipping...`);
        } else {
          this.logger.info(`Installing app on ${webId}...`);

          await ctx.call(
            'auth-agent.install',
            {
              appUri,
              acceptAllRequirements: true
            },
            { meta: { webId } }
          );
        }
      }
    },
    /**
     * Delete all app registrations for the given user
     */
    async deleteAppRegistrations(ctx) {
      const { username } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      for (const { webId, username: dataset } of accounts) {
        ctx.meta.dataset = dataset;
        ctx.meta.webId = webId;

        this.logger.info(`Deleting app registrations of ${webId}...`);

        const container = await ctx.call('app-registrations.list', { webId });

        for (let appRegistration of arrayOf(container['ldp:contains'])) {
          this.logger.info(`Deleting app ${appRegistration['interop:registeredAgent']}...`);
          await ctx.call('app-registrations.delete', { resourceUri: appRegistration.id, webId });
        }
      }
    },
    /**
     * Create missing containers for the given user
     */
    async createMissingContainers(ctx) {
      const { username } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      for (const { webId, username: dataset } of accounts) {
        ctx.meta.dataset = dataset;
        const storageUrl = await ctx.call('solid-storage.getUrl', { webId });

        const registeredContainers = await ctx.call('ldp.registry.list');
        for (const container of Object.values(registeredContainers)) {
          const containerUri = urlJoin(storageUrl, container.path);
          const containerExist = await ctx.call('ldp.container.exist', { containerUri, webId });
          if (!containerExist) {
            this.logger.info(`Container ${containerUri} doesn't exist yet. Creating it...`);
            await ctx.call('ldp.container.createAndAttach', {
              containerUri,
              permissions: container.permissions,
              webId
            });
          }
        }
      }
    },
    /**
     * Refresh the permissions of every registered containers
     * Similar to webacl.resource.refreshContainersRights but works with Pods
     */
    async addContainersRights(ctx) {
      const { username } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      for (const { webId, username: dataset } of accounts) {
        ctx.meta.dataset = dataset;
        ctx.meta.webId = webId;

        const podUrl = await ctx.call('solid-storage.getUrl', { webId });
        const registeredContainers = await ctx.call('ldp.registry.list', { dataset });

        for (const { permissions, podsContainer, path } of Object.values(registeredContainers)) {
          if (permissions && !podsContainer) {
            const containerUri = urlJoin(podUrl, path);
            const containerRights = typeof permissions === 'function' ? permissions('system', ctx) : permissions;

            this.logger.info(`Adding rights for container ${containerUri}...`);

            await ctx.call('webacl.resource.addRights', {
              resourceUri: containerUri,
              additionalRights: containerRights,
              webId: 'system'
            });
          }
        }
      }
    },
    /**
     * Ensure there is no orphan container
     */
    async attachAllContainersToParent(ctx) {
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
    },
    async deleteEmptyCollections(ctx) {
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

          for (const [objectUri, collectionUri] of results.map(r => [r.objectUri.value, r.collectionUri.value])) {
            const isEmpty = await ctx.call('activitypub.collection.isEmpty', { collectionUri });
            if (isEmpty) {
              const exist = await ctx.call('ldp.resource.exist', { resourceUri: collectionUri, webId: 'system' });
              if (exist) {
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
    },
    async deleteDoubleNameFromProfiles(ctx) {
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
    },
    async changeBaseUrl(ctx) {
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
  }
};
