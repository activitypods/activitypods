import path from 'path';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
const { MoleculerError } = require('moleculer').Errors;
import { ACTIVITY_TYPES } from '@semapps/activitypub';
import { getId } from '@semapps/ldp';
import { arraysEqual } from '../../../utils.ts';
import { ServiceSchema, defineAction } from 'moleculer';

const RegistrationEndpointSchema = {
  name: 'registration-endpoint' as const,
  dependencies: ['api', 'ldp'],
  async started() {
    const basePath = await this.broker.call('ldp.getBasePath');
    await this.broker.call('api.addRoute', {
      route: {
        name: 'sai-registration-endpoint',
        path: path.join(basePath, '/.auth-agent/app-registrations'),
        authorization: true,
        authentication: false,
        bodyParsers: {
          json: true
        },
        aliases: {
          'POST /register': 'registration-endpoint.register',
          'POST /upgrade': 'registration-endpoint.upgrade',
          'POST /remove': 'registration-endpoint.remove',
          'GET /': 'registration-endpoint.getForAgent'
        }
      }
    });
  },
  actions: {
    register: defineAction({
      async handler(ctx) {
        let { appUri, acceptedAccessNeeds, acceptedSpecialRights, acceptAllRequirements = false } = ctx.params;

        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.meta.webId;
        const account = await ctx.call('auth.account.findByWebId', { webId });
        // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
        ctx.meta.dataset = account.username;

        // Force to get through network
        const app = await ctx.call('ldp.remote.getNetwork', { resourceUri: appUri });

        const appRegistration = await ctx.call('app-registrations.getForAgent', { agentUri: appUri, podOwner: webId });

        if (appRegistration) {
          throw new MoleculerError(
            `User already has an application registration. Upgrade or remove the app first.`,
            400,
            'BAD REQUEST'
          );
        }

        if (acceptAllRequirements) {
          if (acceptedAccessNeeds || acceptedSpecialRights) {
            throw new Error(
              `If acceptAllRequirements is true, you should not pass acceptedAccessNeeds or acceptedSpecialRights`
            );
          }

          const requirements = await ctx.call('applications.getRequirements', { appUri });
          // @ts-expect-error TS(2339): Property 'accessNeeds' does not exist on type 'nev... Remove this comment to see the full error message
          acceptedAccessNeeds = requirements.accessNeeds;
          // @ts-expect-error TS(2339): Property 'specialRights' does not exist on type 'n... Remove this comment to see the full error message
          acceptedSpecialRights = requirements.specialRights;
        }

        // Generate the app registration. Access grants will be added later.
        const appRegistrationUri = await ctx.call('app-registrations.createOrUpdate', {
          agentUri: appUri,
          podOwner: webId,
          specialRightsUris: acceptedSpecialRights
        });

        await ctx.call('access-authorizations.generateFromAccessNeeds', {
          accessNeedsUris: acceptedAccessNeeds,
          podOwner: webId,
          grantee: appUri
        });

        await ctx.call('permissions-mapper.addPermissionsFromSpecialRights', {
          podOwner: webId,
          appUri,
          specialRightsUris: acceptedSpecialRights
        });

        if (this.broker.cacher) {
          // Invalidate all rights of the application on the Pod as they may now be completely different
          await ctx.call('webacl.cache.invalidateAllUserRightsOnPod', { webId: appUri, podOwner: webId });
        }

        // If the app is an ActivityPub actor, send notification
        // @ts-expect-error TS(2339): Property 'inbox' does not exist on type 'never'.
        if (app.inbox) {
          await ctx.call('activitypub.outbox.post', {
            collectionUri: urlJoin(webId, 'outbox'),
            '@type': ACTIVITY_TYPES.CREATE,
            object: appRegistrationUri,
            to: appUri
          });
        }

        return appRegistrationUri;
      }
    }),

    upgrade: defineAction({
      async handler(ctx) {
        let { appUri, acceptedAccessNeeds, acceptedSpecialRights, acceptAllRequirements = false } = ctx.params;

        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.meta.webId;
        const account = await ctx.call('auth.account.findByWebId', { webId });
        // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
        ctx.meta.dataset = account.username;

        const oldAppRegistration = await ctx.call('app-registrations.getForAgent', {
          agentUri: appUri,
          podOwner: webId
        });

        if (!oldAppRegistration) {
          throw new MoleculerError(
            `User doesn't have a registration for this application. Register it first.`,
            400,
            'BAD REQUEST'
          );
        }

        // Force to get through network
        const app = await ctx.call('ldp.remote.getNetwork', { resourceUri: appUri });

        if (acceptAllRequirements) {
          if (acceptedAccessNeeds || acceptedSpecialRights) {
            throw new Error(
              `If acceptAllRequirements is true, you should not pass acceptedAccessNeeds or acceptedSpecialRights`
            );
          }

          const requirements = await ctx.call('applications.getRequirements', { appUri });
          // @ts-expect-error TS(2339): Property 'accessNeeds' does not exist on type 'nev... Remove this comment to see the full error message
          acceptedAccessNeeds = requirements.accessNeeds;
          // @ts-expect-error TS(2339): Property 'specialRights' does not exist on type 'n... Remove this comment to see the full error message
          acceptedSpecialRights = requirements.specialRights;
        }

        // Update the app registration. Access grants will be added later.
        const appRegistrationUri = await ctx.call('app-registrations.createOrUpdate', {
          agentUri: appUri,
          podOwner: webId,
          specialRightsUris: acceptedSpecialRights
        });

        await ctx.call('access-authorizations.generateFromAccessNeeds', {
          accessNeedsUris: acceptedAccessNeeds,
          podOwner: webId,
          grantee: appUri
        });

        // If the special rights changed, first remove the old rights, before adding the new ones
        if (!arraysEqual(oldAppRegistration['apods:hasSpecialRights'], acceptedSpecialRights)) {
          await ctx.call('permissions-mapper.removePermissionsFromSpecialRights', {
            podOwner: webId,
            appUri,
            specialRightsUris: oldAppRegistration['apods:hasSpecialRights']
          });

          await ctx.call('permissions-mapper.addPermissionsFromSpecialRights', {
            podOwner: webId,
            appUri,
            specialRightsUris: acceptedSpecialRights
          });
        }

        if (this.broker.cacher) {
          // Invalidate all rights of the application on the Pod as they may now be completely different
          await ctx.call('webacl.cache.invalidateAllUserRightsOnPod', { webId: appUri, podOwner: webId });
        }

        // If the app is an ActivityPub actor, send notification
        // @ts-expect-error TS(2339): Property 'inbox' does not exist on type 'never'.
        if (app.inbox) {
          await ctx.call('activitypub.outbox.post', {
            collectionUri: urlJoin(webId, 'outbox'),
            '@type': ACTIVITY_TYPES.UPDATE,
            object: appRegistrationUri,
            to: appUri
          });
        }

        return appRegistrationUri;
      }
    }),

    remove: defineAction({
      async handler(ctx) {
        const { appUri } = ctx.params;

        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.meta.webId;
        const account = await ctx.call('auth.account.findByWebId', { webId });
        // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
        ctx.meta.dataset = account.username;

        const app = await ctx.call('applications.get', { appUri, webId });
        const appRegistration = await ctx.call('app-registrations.getForAgent', { agentUri: appUri, podOwner: webId });

        if (appRegistration) {
          // Immediately delete existing webhooks channels to avoid permissions errors later
          await ctx.call('solid-notifications.provider.webhook.deleteAppChannels', { appUri, webId });

          // This will also delete the authorizations and grants linked to the agent
          await ctx.call('app-registrations.delete', { resourceUri: getId(appRegistration), webId });

          await ctx.call('permissions-mapper.removePermissionsFromSpecialRights', {
            podOwner: webId,
            appUri,
            specialRightsUris: appRegistration['apods:hasSpecialRights']
          });

          // If the app is an ActivityPub actor, send notification
          // @ts-expect-error TS(2339): Property 'inbox' does not exist on type 'never'.
          if (app.inbox) {
            await ctx.call('activitypub.outbox.post', {
              collectionUri: urlJoin(webId, 'outbox'),
              type: ACTIVITY_TYPES.DELETE,
              // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
              object: appRegistration.id || appRegistration['@id'],
              to: appUri
            });
          }

          if (this.broker.cacher) {
            // Invalidate all rights of the application on the Pod as they may now be completely different
            await ctx.call('webacl.cache.invalidateAllUserRightsOnPod', { webId: appUri, podOwner: webId });
          }
        }
      }
    }),

    getForAgent: defineAction({
      async handler(ctx) {
        const { agent } = ctx.params;
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.meta.webId;
        return await ctx.call('app-registrations.getForAgent', { agentUri: agent, podOwner: webId });
      }
    })
  }
} satisfies ServiceSchema;

export default RegistrationEndpointSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [RegistrationEndpointSchema.name]: typeof RegistrationEndpointSchema;
    }
  }
}
