const path = require('path');
const urlJoin = require('url-join');
const { triple, namedNode } = require('@rdfjs/data-model');
const { MoleculerError } = require('moleculer').Errors;
const { SingleResourceContainerMixin } = require('@semapps/ldp');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');
const CONFIG = require('../../config/config');

module.exports = {
  name: 'auth-agent',
  mixins: [SingleResourceContainerMixin],
  settings: {
    acceptedTypes: ['interop:AuthorizationAgent'],
    initialValue: {
      'interop:hasAuthorizationRedirectEndpoint': urlJoin(CONFIG.FRONTEND_URL, 'authorize')
    },
    podProvider: true,
    newResourcesPermissions: {
      anon: {
        read: true
      }
    }
  },
  dependencies: ['api', 'ldp'],
  async started() {
    const basePath = await this.broker.call('ldp.getBasePath');
    await this.broker.call('api.addRoute', {
      route: {
        name: 'auth-agent',
        path: path.join(basePath, '/.auth-agent'),
        authorization: true,
        authentication: false,
        bodyParsers: {
          json: true
        },
        aliases: {
          'POST /register-app': 'auth-agent.registerApp',
          'POST /upgrade-app': 'auth-agent.upgradeApp',
          'POST /remove-app': 'auth-agent.removeApp'
        }
      }
    });
  },
  actions: {
    // Action from the ControlledContainerMixin, called when we do GET or HEAD requests on resources
    async getHeaderLinks(ctx) {
      // Only return header if the fetch is made by a registered app
      if (ctx.meta.impersonatedUser) {
        const appUri = ctx.meta.webId;
        const podOwner = ctx.meta.impersonatedUser;

        const appRegistration = await ctx.call('app-registrations.getForApp', { appUri, podOwner });

        if (appRegistration) {
          return [
            {
              uri: appRegistration['interop:registeredAgent'],
              anchor: appRegistration.id || appRegistration['@id'],
              rel: 'http://www.w3.org/ns/solid/interop#registeredAgent'
            }
          ];
        }
      }
    },
    async registerApp(ctx) {
      let { appUri, acceptedAccessNeeds, acceptedSpecialRights, acceptAllRequirements = false } = ctx.params;

      const webId = ctx.meta.webId;
      const account = await ctx.call('auth.account.findByWebId', { webId });
      ctx.meta.dataset = account.username;

      const app = await ctx.call('activitypub.actor.get', { actorUri: appUri, webId });
      const appRegistration = await ctx.call('app-registrations.getForApp', { appUri, podOwner: webId });

      if (appRegistration) {
        throw new MoleculerError(
          `User already has an application registration. Upgrade or uninstall the app first.`,
          400,
          'BAD REQUEST'
        );
      }

      if (acceptAllRequirements) {
        if (!acceptedAccessNeeds || !acceptedSpecialRights) {
          throw new Error(
            `If acceptAllRequirements is true, you should not pass acceptedAccessNeeds or acceptedSpecialRights`
          );
        }

        const requirements = await ctx.call('applications.getRequirements', { appUri });
        acceptedAccessNeeds = requirements.accessNeeds;
        acceptedSpecialRights = requirements.specialRights;
      }

      const appRegistrationUri = await ctx.call('app-registrations.createOrUpdate', {
        appUri,
        podOwner: webId,
        acceptedAccessNeeds,
        acceptedSpecialRights
      });

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
    },
    async upgradeApp(ctx) {
      let { appUri, acceptedAccessNeeds, acceptedSpecialRights, acceptAllRequirements = false } = ctx.params;

      const webId = ctx.meta.webId;
      const account = await ctx.call('auth.account.findByWebId', { webId });
      ctx.meta.dataset = account.username;

      const app = await ctx.call('activitypub.actor.get', { actorUri: appUri, webId });

      if (acceptAllRequirements) {
        if (!acceptedAccessNeeds || !acceptedSpecialRights) {
          throw new Error(
            `If acceptAllRequirements is true, you should not pass acceptedAccessNeeds or acceptedSpecialRights`
          );
        }

        const requirements = await ctx.call('applications.getRequirements', { appUri });
        acceptedAccessNeeds = requirements.accessNeeds;
        acceptedSpecialRights = requirements.specialRights;
      }

      const appRegistrationUri = await ctx.call('app-registrations.createOrUpdate', {
        appUri,
        podOwner: webId,
        acceptedAccessNeeds,
        acceptedSpecialRights
      });

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
    },
    async removeApp(ctx) {
      const { appUri } = ctx.params;

      const webId = ctx.meta.webId;
      const account = await ctx.call('auth.account.findByWebId', { webId });
      ctx.meta.dataset = account.username;

      const app = await ctx.call('applications.get', { appUri, webId });
      const appRegistration = await ctx.call('app-registrations.getForApp', { appUri, podOwner: webId });

      if (appRegistration) {
        // Immediately delete existing webhooks channels to avoid permissions errors later
        await ctx.call('solid-notifications.provider.webhook.deleteAppChannels', { appUri, webId });

        await ctx.call('app-registrations.delete', {
          resourceUri: appRegistration.id,
          webId
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
  hooks: {
    after: {
      async post(ctx, res) {
        await ctx.call('ldp.resource.patch', {
          resourceUri: ctx.params.webId,
          triplesToAdd: [
            triple(
              namedNode(ctx.params.webId),
              namedNode('http://www.w3.org/ns/solid/interop#hasAuthorizationAgent'),
              namedNode(res)
            )
          ],
          webId: 'system'
        });
        return res;
      }
    }
  }
};
