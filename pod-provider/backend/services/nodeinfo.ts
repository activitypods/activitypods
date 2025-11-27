import { NodeinfoService } from '@semapps/nodeinfo';
import * as CONFIG from '../config/config.ts';
import packageDesc from '../package.json' with { type: 'json' };
import { ServiceSchema } from 'moleculer';
import { Account } from '@semapps/auth';

const Schema = {
  mixins: [NodeinfoService],
  settings: {
    baseUrl: CONFIG.BASE_URL,
    software: {
      name: 'activitypods' as const,
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
    getUsersCount: {
      async handler(ctx: any) {
        const accounts: Account[] = await ctx.call('auth.account.find');
        const totalPods = accounts.length;
        return {
          total: totalPods,
          activeHalfYear: totalPods,
          activeMonth: totalPods
        };
      }
    }
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
