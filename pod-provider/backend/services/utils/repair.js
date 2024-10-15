const urlJoin = require('url-join');
const { arrayOf, getParentContainerUri } = require('@semapps/ldp');

/**
 * Service to repair Pods data
 */
module.exports = {
  name: 'repair',
  actions: {
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
     * Refresh the permissions of every registered containers
     * Similar to webacl.resource.refreshContainersRights but works with Pods
     */
    async addContainersRights(ctx) {
      const { username } = ctx.params;
      const accounts = await ctx.call('auth.account.find', { query: username === '*' ? undefined : { username } });

      for (const { webId, username: dataset } of accounts) {
        ctx.meta.dataset = dataset;
        ctx.meta.webId = webId;

        const podUrl = await ctx.call('pod.getUrl', { webId });
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
    }
  }
};
