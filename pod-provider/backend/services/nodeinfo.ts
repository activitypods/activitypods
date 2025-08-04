import { NodeinfoService } from '@semapps/nodeinfo';
import urlJoin from 'url-join';
import CONFIG from '../config/config.ts';
import packageDesc from '../package.json';

const Schema = {
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
      frontend_url: CONFIG.FRONTEND_URL
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

export default Schema;
