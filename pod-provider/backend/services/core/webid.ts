import { WebIdService } from '@semapps/webid';
import { FULL_ACTOR_TYPES } from '@semapps/activitypub';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "webid"; mixins: ({ settings: { path... Remove this comment to see the full error message
  mixins: [WebIdService],
  settings: {
    path: '/',
    baseUrl: CONFIG.BASE_URL,
    acceptedTypes: Object.values(FULL_ACTOR_TYPES),
    podProvider: true,
    podsContainer: true, // Will register the container but not create LDP containers on a dataset
    newResourcesPermissions: {
      anon: {
        read: true
      }
    }
  },
  hooks: {
    before: {
      async createWebId(ctx) {
        const { nick } = ctx.params;
        await ctx.call('solid-storage.create', { username: nick });
        ctx.params['solid:oidcIssuer'] = CONFIG.BASE_URL.replace(/\/$/, ''); // Remove trailing slash if it exists
      }
    }
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
