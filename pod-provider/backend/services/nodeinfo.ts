// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { NodeinfoService } from '@semapps/nodeinfo';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../config/config.ts';
import packageDesc from '../package.json';

export default {
  mixins: [NodeinfoService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    software: {
      name: 'activitypods',
      // @ts-expect-error TS(2339): Property 'version' does not exist on type '{ name:... Remove this comment to see the full error message
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
    async getUsersCount(ctx: any) {
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
