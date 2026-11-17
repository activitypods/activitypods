import path from 'path';
import urlJoin from 'url-join';
const { MoleculerError } = require('moleculer').Errors;
import { ACTIVITY_TYPES } from '@semapps/activitypub';
import { arrayOf, getId } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';
import { arraysEqual } from '../../../utils.ts';
import { ServiceSchema } from 'moleculer';

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
    register: {
      async handler(ctx) {
        let {
          appUri,
          acceptedAccessNeeds,
          acceptedSpecialRights,
          acceptAllRequirements = false,
          storages
        } = ctx.params;

        const callerWebId = ctx.meta.webId;
        const webId = await this.actAsPodOwner(ctx);
        const { dataset } = ctx.meta;

        // The storages on which the app gets access. By default, the Pod of the user.
        // For a group storage, the app must already be registered on it by the group (its members are not asked).
        storages = storages ? arrayOf(storages) : [webId];
        if (webId !== callerWebId && storages.some((storage: string) => storage !== webId)) {
          throw new MoleculerError(
            'An app registered for a group cannot get access to other storages',
            400,
            'BAD_REQUEST'
          );
        }
        const groupStorages = storages.filter((storage: string) => storage !== webId);
        for (const storage of groupStorages) {
          await this.checkGroupStorage(ctx, appUri, webId, storage);
        }
        ctx.meta.dataset = dataset;

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
          acceptedAccessNeeds = requirements.accessNeeds;
          acceptedSpecialRights = requirements.specialRights;
        }

        // The special rights are on the Pod of the user
        if (!storages.includes(webId)) acceptedSpecialRights = [];

        // Generate the app registration. Access grants will be added later.
        const appRegistrationUri = await ctx.call('app-registrations.createOrUpdate', {
          agentUri: appUri,
          podOwner: webId,
          specialRightsUris: acceptedSpecialRights
        });

        if (storages.includes(webId)) {
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
        }

        if (groupStorages.length > 0) {
          // Members are not asked: the app gets the access needs accepted by the group
          const { accessNeeds } = await ctx.call('applications.getRequirements', { appUri });
          for (const storage of groupStorages) {
            await this.authorizeGroupStorage(ctx, appUri, webId, storage, accessNeeds);
          }
        }

        if (this.broker.cacher) {
          // Invalidate all rights of the application on the Pod as they may now be completely different
          await ctx.call('webacl.cache.invalidateAllUserRightsOnPod', { webId: appUri, podOwner: webId });
        }

        // If the app is an ActivityPub actor, send notification
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
    },

    upgrade: {
      async handler(ctx) {
        let { appUri, acceptedAccessNeeds, acceptedSpecialRights, acceptAllRequirements = false } = ctx.params;

        const webId = await this.actAsPodOwner(ctx);

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
          acceptedAccessNeeds = requirements.accessNeeds;
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
    },

    remove: {
      async handler(ctx) {
        const { appUri } = ctx.params;

        const webId = await this.actAsPodOwner(ctx);

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
          if (app.inbox) {
            await ctx.call('activitypub.outbox.post', {
              collectionUri: urlJoin(webId, 'outbox'),
              type: ACTIVITY_TYPES.DELETE,
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
    },

    getForAgent: {
      async handler(ctx) {
        const { agent } = ctx.params;
        const webId = await this.actAsPodOwner(ctx);
        return await ctx.call('app-registrations.getForAgent', { agentUri: agent, podOwner: webId });
      }
    }
  },
  methods: {
    // The app must be registered on the group, and the user must be one of its members
    async checkGroupStorage(ctx, appUri, webId, storage) {
      const groupAccount = await ctx.call('auth.account.findByWebId', { webId: storage });
      if (!groupAccount?.group) throw new MoleculerError(`${storage} is not a group`, 400, 'BAD_REQUEST');

      const meta = { dataset: groupAccount.username };
      if (!(await ctx.call('app-registrations.getForAgent', { agentUri: appUri, podOwner: storage }, { meta }))) {
        throw new MoleculerError(`The application is not registered on ${storage}`, 403, 'FORBIDDEN');
      }
      const roles = await ctx.call(
        'role-registrations.listForAgent',
        { groupWebId: storage, agentUri: webId },
        { meta }
      );
      if (roles.length === 0) throw new MoleculerError(`You are not a member of ${storage}`, 403, 'FORBIDDEN');
    },

    // Authorize the app to access the data registrations of the group, with the rights of the user
    async authorizeGroupStorage(ctx, appUri, webId, storage, accessNeeds) {
      for (const accessNeedUri of accessNeeds) {
        const accessNeed = await ctx.call('ldp.remote.get', { resourceUri: accessNeedUri });
        const dataRegistrationUri = await ctx.call('data-registrations.getByShapeTree', {
          shapeTreeUri: accessNeed['interop:registeredShapeTree'],
          podOwner: storage
        });
        // The group doesn't have this type of data
        if (!dataRegistrationUri) continue;

        await ctx.call('access-authorizations.post', {
          resource: {
            type: 'interop:AccessAuthorization',
            'interop:dataOwner': storage,
            'interop:grantedBy': webId,
            'interop:grantee': appUri,
            'interop:granteeType': 'interop:Application',
            'interop:registeredShapeTree': accessNeed['interop:registeredShapeTree'],
            'interop:hasDataRegistration': dataRegistrationUri,
            'interop:accessMode': accessNeed['interop:accessMode'],
            'interop:scopeOfAuthorization': 'interop:AllFromRegistry',
            'interop:satisfiesAccessNeed': accessNeedUri
          },
          contentType: MIME_TYPES.JSON
        });
      }
    },

    // Members of a group with the ManageAccess right may manage its apps, on behalf of the group
    async actAsPodOwner(ctx) {
      const { podOwner = ctx.meta.webId } = ctx.params;
      const account = await ctx.call('auth.account.findByWebId', { webId: podOwner });
      if (!account) throw new MoleculerError('Unknown pod owner', 404, 'NOT_FOUND');

      if (podOwner !== ctx.meta.webId) {
        const hasRight =
          account.group &&
          (await ctx.call(
            'role-registrations.hasSpecialRight',
            { groupWebId: podOwner, agentUri: ctx.meta.webId, right: 'interop:ManageAccess' },
            { meta: { dataset: account.username } }
          ));
        if (!hasRight)
          throw new MoleculerError('You need the interop:ManageAccess right on this group', 403, 'FORBIDDEN');
        ctx.meta.webId = podOwner;
      }

      ctx.meta.dataset = account.username;
      return podOwner;
    }
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
