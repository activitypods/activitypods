import path from 'path';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { AuthLocalService } from '@semapps/auth';
// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../../config/config.ts';
// @ts-expect-error TS(1192): Module '"/home/laurin/projects/virtual-assembly/ac... Remove this comment to see the full error message
import transport from '../../config/transport.ts';
import { ServiceSchema } from 'moleculer';

const ServiceSchema = {
  mixins: [AuthLocalService],

  settings: {
    baseUrl: CONFIG.BASE_URL,
    jwtPath: path.resolve(__dirname, '../../jwt'),
    accountsDataset: CONFIG.AUTH_ACCOUNTS_DATASET,
    reservedUsernames: CONFIG.AUTH_RESERVED_USER_NAMES,
    minPasswordLength: 8, // Same as frontend requirement
    minUsernameLength: 2,
    webIdSelection: ['nick', 'schema:knowsLanguage'],
    formUrl: CONFIG.FRONTEND_URL ? urlJoin(CONFIG.FRONTEND_URL, 'login') : undefined,
    podProvider: true,
    mail: {
      from: `${CONFIG.FROM_NAME} <${CONFIG.FROM_EMAIL}>`,
      transport,
      defaults: {
        locale: CONFIG.DEFAULT_LOCALE,
        frontUrl: CONFIG.FRONTEND_URL
      }
    }
  },

  hooks: {
    after: {
      async signup(ctx: any, res: any) {
        const { webId } = res;

        await ctx.call('auth-agent.waitForResourceCreation', { webId });
        await ctx.call('agent-registry.waitForResourceCreation', { webId });
        await ctx.call('auth-registry.waitForResourceCreation', { webId });
        await ctx.call('data-registry.waitForResourceCreation', { webId });

        await ctx.call('activitypub.actor.awaitCreateComplete', {
          actorUri: webId,
          additionalKeys: [
            'pim:storage',
            'pim:preferencesFile',
            'interop:hasAuthorizationAgent',
            'interop:hasRegistrySet',
            'solid:publicTypeIndex'
          ]
        });

        // Wait until all data and type registrations are created
        // This is necessary for the data provider to be able to load all containers
        await ctx.call('data-registry.awaitCreateComplete', { webId });
        await ctx.call('type-indexes.awaitCreateComplete', { webId });

        return res;
      }
    }
  }
} satisfies ServiceSchema;

export default ServiceSchema;
