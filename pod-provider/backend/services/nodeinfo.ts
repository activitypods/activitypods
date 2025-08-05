import { NodeinfoService } from '@semapps/nodeinfo';
import urlJoin from 'url-join';
import CONFIG from '../config/config.ts';
import packageDesc from '../package.json' with { type: 'json' };
import { ServiceSchema, defineAction } from 'moleculer';

const Schema = {
  mixins: [NodeinfoService],

  settings: {
    baseUrl: CONFIG.BASE_URL,
    software: {
      name: 'activitypods' as const,
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
    getUsersCount: defineAction({
      async handler(ctx: any) {
        const accounts = await ctx.call('auth.account.find');
        const totalPods = accounts.length;
        return {
          total: totalPods,
          activeHalfYear: totalPods,
          activeMonth: totalPods
        };
      }
    })
  }
} satisfies ServiceSchema;

export default ServiceSchema;
