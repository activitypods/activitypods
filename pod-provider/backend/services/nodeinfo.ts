// @ts-expect-error TS(6059): File '/home/laurin/projects/virtual-assembly/semap... Remove this comment to see the full error message
import { NodeinfoService } from '@semapps/nodeinfo';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
// @ts-expect-error TS(1192): Module '"/home/laurin/projects/virtual-assembly/ac... Remove this comment to see the full error message
import * as CONFIG from '../config/config.ts';
import packageDesc from '../package.json' with { type: 'json' };
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "nodeinfo"; settings: { baseUrl: nul... Remove this comment to see the full error message
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
      async handler(ctx) {
        const accounts = await ctx.call('auth.account.find');
        // @ts-expect-error TS(2339): Property 'length' does not exist on type 'never'.
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
