const { WebIdService } = require('@semapps/webid');
const { FULL_ACTOR_TYPES } = require('@semapps/activitypub');
const CONFIG = require('../../config/config');

module.exports = {
  mixins: [WebIdService],
  settings: {
    path: '/',
    baseUrl: CONFIG.BASE_URL,
    acceptedTypes: Object.values(FULL_ACTOR_TYPES),
    podProvider: true,
    podsContainer: true // Will register the container but not create LDP containers on a dataset
  },
  hooks: {
    before: {
      async createWebId(ctx) {
        const { nick } = ctx.params;
        await ctx.call('pod.create', { username: nick });
        ctx.params['solid:oidcIssuer'] = CONFIG.BASE_URL.replace(/\/$/, ''); // Remove trailing slash if it exists
      }
    }
  }
};
