const { triple, namedNode } = require('@rdfjs/data-model');
const { MigrationService } = require('@semapps/migration');
const { arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const CONFIG = require('../../config/config');

module.exports = {
  name: 'migration',
  mixins: [MigrationService],
  settings: {
    baseUrl: CONFIG.BASE_URL
  },
  actions: {
    async migrate(ctx) {
      const { username, version } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      for (const account of accounts) {
        if (account.version === version) {
          this.logger.info(`Pod of ${account.webId} is already on v${version}, skipping...`);
        } else {
          this.logger.info(`Migrating Pod of ${account.webId} to v${version}...`);

          ctx.meta.dataset = account.username;
          ctx.meta.webId = account.webId;
          ctx.meta.skipObjectsWatcher = true; // We don't want to trigger an Update

          if (version === '2.0.5') {
            await ctx.call('repair.createMissingContainers', { username: account.username });
            await this.actions.addAuthorizationAgent({ username: account.username }, { parentCtx: ctx });
            await this.actions.generateRegistries({ username: account.username }, { parentCtx: ctx });
            await this.actions.generateAuthorizations({ username: account.username }, { parentCtx: ctx });
          } else {
            throw new Error(`No migration exist for version ${version}`);
          }

          await ctx.call('auth.account.update', {
            id: account['@id'],
            ...account,
            version
          });
        }
      }
    },
    async addAuthorizationAgent(ctx) {
      const { username } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      for (const { webId } of accounts) {
        const authAgentExist = await ctx.call('auth-agent.exist', { webId });
        if (authAgentExist) {
          this.logger.warn(`AuthorizationAgent already exist for ${webId}, skipping...`);
        } else {
          this.logger.info(`Creating AuthorizationAgent for ${webId}`);
          await ctx.call('auth-agent.initializeResource', { webId });
        }

        const authAgent = await ctx.call('auth-agent.get', { webId });

        const appRegistrationsContainer = await ctx.call('app-registrations.list', { webId });
        const appRegistrations = arrayOf(appRegistrationsContainer['ldp:contains']);

        for (const appRegistration of appRegistrations) {
          this.logger.info(
            `Adding interop:registeredWith to app registration of ${appRegistration['interop:registeredAgent']} (webId ${webId})`
          );

          await ctx.call('app-registrations.patch', {
            resourceUri: appRegistration.id,
            triplesToAdd: [
              triple(
                namedNode(appRegistration.id),
                namedNode('http://www.w3.org/ns/solid/interop#registeredWith'),
                namedNode(authAgent.id)
              )
            ],
            webId: 'system'
          });
        }
      }
    },
    async generateRegistries(ctx) {
      const { username } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      for (const { webId } of accounts) {
        const registrySetExist = await ctx.call('registry-set.exist', { webId });
        if (registrySetExist) {
          this.logger.warn(`RegistrySet already exist for ${webId}, skipping...`);
        } else {
          this.logger.info(`Creating RegistrySet for ${webId}`);
          await ctx.call('registry-set.initializeResource', { webId });
        }

        const authRegistryExist = await ctx.call('auth-registry.exist', { webId });
        if (authRegistryExist) {
          this.logger.warn(`AuthorizationRegistry already exist for ${webId}, skipping...`);
        } else {
          this.logger.info(`Creating AuthorizationRegistry for ${webId}`);
          await ctx.call('auth-registry.initializeResource', { webId });
        }

        const agentRegistryExist = await ctx.call('agent-registry.exist', { webId });
        if (agentRegistryExist) {
          this.logger.warn(`AgentRegistry already exist for ${webId}, skipping...`);
        } else {
          this.logger.info(`Creating AgentRegistry for ${webId}`);
          await ctx.call('agent-registry.initializeResource', { webId });

          const appRegistrationsContainer = await ctx.call('app-registrations.list', { webId });
          const appRegistrations = arrayOf(appRegistrationsContainer['ldp:contains']);

          for (const appRegistration of appRegistrations) {
            this.logger.info(
              `Adding ApplicationRegistration of ${appRegistration['interop:registeredAgent']} to AgentRegistry`
            );
            await ctx.call('agent-registry.add', {
              podOwner: webId,
              appRegistrationUri: appRegistration.id
            });
          }
        }
      }
    },
    async generateAuthorizations(ctx) {
      const { username } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      for (const { webId } of accounts) {
        this.logger.info(`Generating authorizations for ${webId}...`);

        const authAgentUri = await ctx.call('auth-agent.getResourceUri', { webId });

        const accessGrantsContainer = await ctx.call('access-grants.list', { webId });
        const accessGrants = arrayOf(accessGrantsContainer['ldp:contains']);

        for (const accessGrant of accessGrants) {
          let dataAuthorizationsUris = [];

          for (const dataGrantUri of arrayOf(accessGrant['interop:hasDataGrant'])) {
            const dataGrant = await ctx.call('data-grants.get', { resourceUri: dataGrantUri, webId });

            const dataAuthorization = await ctx.call('data-authorizations.getByAccessNeed', {
              accessNeedUri: dataGrant['interop:satisfiesAccessNeed'],
              podOwner: webId
            });

            if (dataAuthorization) {
              this.logger.warn(`DataAuthorization for DataGrant ${dataGrant.id} already exist, skipping...`);
              dataAuthorizationsUris.push(dataAuthorization.id);
            } else {
              this.logger.info(`Generating DataAuthorization from DataGrant ${dataGrant.id}`);
              dataAuthorizationsUris.push(
                await ctx.call(
                  'data-authorizations.post',
                  {
                    resource: {
                      ...dataGrant,
                      type: 'interop:DataAuthorization',
                      id: undefined,
                      'interop:scopeOfAuthorization': dataGrant['interop:scopeOfGrant'],
                      'interop:scopeOfGrant': undefined
                    },
                    contentType: MIME_TYPES.JSON,
                    webId
                  },
                  { meta: { isMigration: true } }
                )
              );
            }
          }

          const accessAuthorization = await ctx.call('access-authorizations.getByAccessNeedGroup', {
            accessNeedGroupUri: accessGrant['interop:hasAccessNeedGroup'],
            podOwner: webId
          });

          if (accessAuthorization) {
            this.logger.warn(`AccessAuthorization for AccessGrant ${accessGrant.id} already exist, skipping...`);
          } else {
            this.logger.info(`Generating AccessAuthorization from AccessGrant ${accessGrant.id}`);

            await ctx.call(
              'access-authorizations.post',
              {
                resource: {
                  ...accessGrant,
                  type: 'interop:AccessAuthorization',
                  id: undefined,
                  'interop:grantedWith': authAgentUri,
                  'interop:hasDataGrant': undefined,
                  'interop:hasDataAuthorization': dataAuthorizationsUris
                },
                contentType: MIME_TYPES.JSON,
                webId
              },
              { meta: { isMigration: true } }
            );
          }
        }
      }
    }
  }
};
