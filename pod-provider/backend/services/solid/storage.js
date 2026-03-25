const { StorageService } = require('@semapps/solid');
const CONFIG = require('../../config/config');
const urlJoin = require('url-join');

module.exports = {
  mixins: [StorageService],
  dependencies: ['dataset-provisioning'],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    secureDataset: process.env.SEMAPPS_SECURE_DATASET !== 'false'
  },
  actions: {
    async create(ctx) {
      const { username } = ctx.params;
      if (!username) throw new Error('Cannot create Solid storage without a username');

      const shouldUseSecureDataset = this.settings.secureDataset !== false;

      if (shouldUseSecureDataset) {
        await ctx.call('dataset-provisioning.ensureSecureDataset', { dataset: username });
      } else {
        await ctx.call('triplestore.dataset.create', {
          dataset: username,
          secure: false
        });
      }

      ctx.meta.dataset = username;

      const storageRootUri = urlJoin(this.settings.baseUrl, username, this.settings.pathName);
      await ctx.call('ldp.container.create', { containerUri: storageRootUri, webId: 'system' });

      return storageRootUri;
    }
  }
};
