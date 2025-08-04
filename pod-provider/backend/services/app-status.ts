const { MoleculerError } = require('moleculer').Errors;
import { getDatasetFromUri } from '@semapps/ldp';
import CONFIG from '../config/config.ts';
import { arraysEqual } from '../utils.ts';
import { ServiceSchema, defineAction } from 'moleculer';

const AppStatusService = {
  name: 'app-status' as const,
  dependencies: ['api'],
  started() {
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
      async handler(ctx) {
        let onlineBackend = true,
          remoteAppData;

        // Ensure appUri is not an internal URL
        if (ctx.params.appUri && ctx.params.appUri.startsWith(CONFIG.BASE_URL)) {
          throw new MoleculerError(`Invalid application URL`, 400, 'BAD_REQUEST');
        }

        const appUri = ctx.meta.impersonatedUser ? ctx.meta.webId : ctx.params.appUri;
        const webId = ctx.meta.impersonatedUser || ctx.meta.webId;

        ctx.meta.dataset = getDatasetFromUri(webId);

        const installed = await ctx.call('app-registrations.isRegistered', { agentUri: appUri, podOwner: webId });

        const localAppData = installed && (await ctx.call('ldp.remote.getStored', { resourceUri: appUri, webId }));

        try {
          remoteAppData = await ctx.call('ldp.remote.getNetwork', { resourceUri: appUri, webId });
        } catch (e) {
          onlineBackend = false;
        }

        const webhookChannels = installed
          ? await ctx.call('solid-notifications.provider.webhook.getAppChannels', { appUri, webId })
          : undefined;

        // A upgrade is needed if the access need group(s) have changed
        const upgradeNeeded =
          onlineBackend &&
          installed &&
          !arraysEqual(localAppData['interop:hasAccessNeedGroup'], remoteAppData['interop:hasAccessNeedGroup']);

        return {
          onlineBackend,
          installed,
          upgradeNeeded,
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
