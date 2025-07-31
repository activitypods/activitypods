const { MoleculerError } = require('moleculer').Errors;

// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { getDatasetFromUri } from '@semapps/ldp';
// @ts-expect-error TS(2306): File '/home/laurin/projects/virtual-assembly/activ... Remove this comment to see the full error message
import CONFIG from '../config/config.ts';
import { ServiceSchema, defineAction } from 'moleculer';

const AppStatusService = {
  name: 'app-status' as const,
  dependencies: ['api'],
  started() {
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type '{ name: ... Remove this comment to see the full error message
    this.broker.call('api.addRoute', {
      route: {
        name: 'app-status',
        path: '/.well-known/app-status',
        authentication: true,
        aliases: {
          'GET /': 'app-status.get'
        }
      }
    });
  },
  actions: {
    get: defineAction({
      async handler(ctx: any) {
        let onlineBackend = true,
          remoteAppData;

        // Ensure appUri is not an internal URL
        if (ctx.params.appUri && ctx.params.appUri.startsWith(CONFIG.BASE_URL)) {
          throw new MoleculerError(`Invalid application URL`, 400, 'BAD_REQUEST');
        }

        const appUri = ctx.meta.impersonatedUser ? ctx.meta.webId : ctx.params.appUri;
        const webId = ctx.meta.impersonatedUser || ctx.meta.webId;

        ctx.meta.dataset = getDatasetFromUri(webId);

        const installed = await ctx.call('app-registrations.isRegistered', { appUri, podOwner: webId });

        const localAppData = installed && (await ctx.call('ldp.remote.getStored', { resourceUri: appUri, webId }));

        try {
          remoteAppData = await ctx.call('ldp.remote.getNetwork', { resourceUri: appUri, webId });
        } catch (e) {
          onlineBackend = false;
        }

        const webhookChannels = installed
          ? await ctx.call('solid-notifications.provider.webhook.getAppChannels', { appUri, webId })
          : undefined;

        return {
          onlineBackend,
          installed,
          upgradeNeeded:
            onlineBackend && installed ? localAppData['dc:modified'] != remoteAppData['dc:modified'] : undefined,
          webhookChannels
        };
      }
    })
  }
} satisfies ServiceSchema;

export default AppStatusService;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AppStatusService.name]: typeof AppStatusService;
    }
  }
}
