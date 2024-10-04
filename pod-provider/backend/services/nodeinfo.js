const { NodeinfoService } = require('@semapps/nodeinfo');
const urlJoin = require('url-join');
const CONFIG = require('../config/config');
const packageDesc = require('../package.json');

module.exports = {
  mixins: [NodeinfoService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    software: {
      name: 'activitypods',
      version: packageDesc.version,
      repository: packageDesc.repository?.url,
      homepage: packageDesc.homepage
    },
    protocols: ['activitypub'],
    metadata: {
      frontend_url: CONFIG.FRONTEND_URL,
      login_url: CONFIG.FRONTEND_URL && urlJoin(CONFIG.FRONTEND_URL, 'login'),
      consent_url: CONFIG.FRONTEND_URL && urlJoin(CONFIG.FRONTEND_URL, 'authorize'),
      signup_url: CONFIG.FRONTEND_URL && urlJoin(CONFIG.FRONTEND_URL, 'login?signup=true'),
      logout_url: CONFIG.FRONTEND_URL && urlJoin(CONFIG.FRONTEND_URL, 'login?logout=true')
    }
  },
  actions: {
    async getUsersCount(ctx) {
      const accounts = await ctx.call('auth.account.find');
      const totalPods = accounts.length;
      return {
        total: totalPods,
        activeHalfYear: totalPods,
        activeMonth: totalPods
      };
    }
  }
};
