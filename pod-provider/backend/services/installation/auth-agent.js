const path = require('path');
const urlJoin = require('url-join');
const { triple, namedNode, literal } = require('@rdfjs/data-model');
const { MoleculerError } = require('moleculer').Errors;
const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');
const CONFIG = require('../../config/config');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'auth-agent',
  mixins: [ControlledContainerMixin],
  dependencies: ['api', 'ldp'],
  settings: {
    acceptedTypes: ['interop:AuthorizationAgent'],
    excludeFromMirror: true,
    activateTombstones: false,
    newResourcesPermissions: {
      anon: {
        read: true
      }
    },
    description: {
      labelMap: {
        en: 'Authorization Agents'
      },
      internal: true
    }
  },
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
          'POST /install': 'auth-agent.install',
          'POST /upgrade': 'auth-agent.upgrade',
          'POST /uninstall': 'auth-agent.uninstall'
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
    async initializeAgent(ctx) {
      const { webId } = ctx.params;

      const containerUri = await this.actions.getContainerUri({ webId }, { parentCtx: ctx });
      await this.actions.waitForContainerCreation({ containerUri }, { parentCtx: ctx });

      const agentUri = await this.actions.post(
        {
          resource: {
            type: 'interop:AuthorizationAgent',
            'interop:hasAuthorizationRedirectEndpoint': urlJoin(CONFIG.FRONTEND_URL, 'authorize')
          },
          contentType: MIME_TYPES.JSON,
          webId
        },
        { parentCtx: ctx }
      );

      await ctx.call('ldp.resource.patch', {
        resourceUri: webId,
        triplesToAdd: [
          triple(
            namedNode(webId),
            namedNode('http://www.w3.org/ns/solid/interop#hasAuthorizationAgent'),
            namedNode(agentUri)
          )
        ],
        webId: 'system'
      });
    },
    async getAgent(ctx) {
      const { webId } = ctx.params;
      const container = await this.actions.list({ webId }, { parentCtx: ctx });
      const resources = arrayOf(container['ldp:includes']);
      if (resources.length > 0) {
        return resources[0];
      }
    },
    async install(ctx) {
      const { appUri, acceptedAccessNeeds, acceptedSpecialRights } = ctx.params;
      const webId = ctx.meta.webId;

      const app = await ctx.call('activitypub.actor.get', { actorUri: appUri, webId });
      const appRegistration = await ctx.call('app-registrations.getForApp', { appUri, podOwner: webId });

      if (appRegistration) {
        throw new MoleculerError(
          `User already has an application registration. Upgrade or uninstall the app first.`,
          400,
          'BAD REQUEST'
        );
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
    async upgrade(ctx) {
      const { appUri, acceptedAccessNeeds, acceptedSpecialRights } = ctx.params;
      const webId = ctx.meta.webId;

      const app = await ctx.call('activitypub.actor.get', { actorUri: appUri, webId });

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
    async uninstall(ctx) {
      const { appUri } = ctx.params;
      const webId = ctx.meta.webId;

      const app = await ctx.call('activitypub.actor.get', { actorUri: appUri, webId });
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
  events: {
    async 'auth.registered'(ctx) {
      const { webId } = ctx.params;
      await this.actions.initializeAgent({ webId }, { parentCtx: ctx });
    }
  }
};
