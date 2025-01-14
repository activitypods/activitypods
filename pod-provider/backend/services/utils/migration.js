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
};
