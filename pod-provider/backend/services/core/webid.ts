import { WebIdService } from '@semapps/webid';
import { FULL_ACTOR_TYPES } from '@semapps/activitypub';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const Schema = {
  mixins: [WebIdService],
  settings: {
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
        const storageUrl = await ctx.call('solid-storage.create', { username: nick });
        ctx.params['pim:storage'] = storageUrl;
        ctx.params['solid:oidcIssuer'] = this.settings.baseUrl.replace(/\/$/, ''); // Remove trailing slash if it exists
      }
    }
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
