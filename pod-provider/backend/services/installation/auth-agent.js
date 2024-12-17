const urlJoin = require('url-join');
const { triple, namedNode, literal } = require('@rdfjs/data-model');
const { MoleculerError } = require('moleculer').Errors;
const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');
const { ActivitiesHandlerMixin, ACTIVITY_TYPES } = require('@semapps/activitypub');
const CONFIG = require('../../config/config');

module.exports = {
  name: 'auth-agent',
  mixins: [ActivitiesHandlerMixin, ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:AuthorizationAgent'],
    description: {
      labelMap: {
        en: 'Authorization Agents'
      },
      internal: true
    }
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
      const agentUri = await this.actions.post(
        {
          resource: {
            type: 'interop:AuthorizationAgent',
            'interop:hasAuthorizationRedirectEndpoint': urlJoin(CONFIG.FRONTEND_URL, 'authorize')
          },
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
    }
  },
  events: {
    async 'auth.registered'(ctx) {
      const { webId } = ctx.params;
      await this.actions.initializeAgent({ webId }, { parentCtx: ctx });
    }
  },
  activities: {
    install: {
      match: {
        type: 'apods:Install'
      },
      async onEmit(ctx, activity, emitterUri) {
        const appUri = activity.object;

        const appRegistration = await ctx.call('app-registrations.getForApp', {
          appUri,
          podOwner: emitterUri
        });

        if (appRegistration) {
          throw new MoleculerError(
            `User already has an application registration. Upgrade or uninstall the app first.`,
            400,
            'BAD REQUEST'
          );
        }

        const appRegistrationUri = await ctx.call('app-registrations.createOrUpdate', {
          appUri,
          podOwner: emitterUri,
          acceptedAccessNeeds: activity['apods:acceptedAccessNeeds'],
          acceptedSpecialRights: activity['apods:acceptedSpecialRights']
        });

        await ctx.call('activitypub.outbox.post', {
          collectionUri: urlJoin(emitterUri, 'outbox'),
          '@type': ACTIVITY_TYPES.CREATE,
          object: appRegistrationUri,
          to: appUri
        });

        if (this.broker.cacher) {
          // Invalidate all rights of the application on the Pod as they may now be completely different
          await ctx.call('webacl.cache.invalidateAllUserRightsOnPod', { webId: appUri, podOwner: emitterUri });
        }
      }
    },
    upgrade: {
      match: {
        type: 'apods:Upgrade'
      },
      async onEmit(ctx, activity, emitterUri) {
        const appUri = activity.object;

        const appRegistrationUri = await ctx.call('app-registrations.createOrUpdate', {
          appUri,
          podOwner: emitterUri,
          acceptedAccessNeeds: activity['apods:acceptedAccessNeeds'],
          acceptedSpecialRights: activity['apods:acceptedSpecialRights']
        });

        await ctx.call('activitypub.outbox.post', {
          collectionUri: urlJoin(emitterUri, 'outbox'),
          '@type': ACTIVITY_TYPES.UPDATE,
          object: appRegistrationUri,
          to: appUri
        });

        if (this.broker.cacher) {
          // Invalidate all rights of the application on the Pod as they may now be completely different
          await ctx.call('webacl.cache.invalidateAllUserRightsOnPod', { webId: appUri, podOwner: emitterUri });
        }
      }
    },
    rejectAppRegistration: {
      match: {
        type: ACTIVITY_TYPES.REJECT,
        object: {
          type: ACTIVITY_TYPES.CREATE,
          object: {
            type: 'interop:ApplicationRegistration'
          }
        }
      },
      async onReceive(ctx, activity, recipientUri) {
        const appRegistrationUri = activity.object.object.id;

        const appRegistration = await ctx.call('app-registrations.get', {
          resourceUri: appRegistrationUri,
          webId: recipientUri
        });

        // SECURITY CHECKS

        if (appRegistration['interop:registeredBy'] !== recipientUri) {
          throw new Error(`The ApplicationRegistration ${appRegistrationUri} is not owned by ${recipientUri}`);
        }

        if (appRegistration['interop:registeredAgent'] !== activity.actor) {
          throw new Error(`The ApplicationRegistration ${appRegistrationUri} is not for actor ${activity.actor}`);
        }

        // DELETE APPLICATION REGISTRATION (THIS WILL ALSO DELETE ALL ASSOCIATED GRANTS)

        await ctx.call('app-registrations.delete', {
          resourceUri: appRegistrationUri,
          webId: recipientUri
        });

        if (this.broker.cacher) {
          // Invalidate all rights of the application on the Pod as they may now be completely different
          await ctx.call('webacl.cache.invalidateAllUserRightsOnPod', {
            webId: activity.actor,
            podOwner: recipientUri
          });
        }
      }
    },
    uninstall: {
      match: {
        type: ACTIVITY_TYPES.UNDO,
        object: {
          type: 'apods:Install'
        }
      },
      async onEmit(ctx, activity, emitterUri) {
        const appUri = activity.object.object;
        const podOwner = emitterUri;

        const appRegistration = await ctx.call('app-registrations.getForApp', { appUri, podOwner });

        if (appRegistration) {
          // Immediately delete existing webhooks channels to avoid permissions errors later
          await ctx.call('solid-notifications.provider.webhook.deleteAppChannels', { appUri, webId: emitterUri });

          // Delete registration locally (through activitypub.object.process) and warn the app to delete its cache
          await ctx.call('activitypub.outbox.post', {
            collectionUri: urlJoin(emitterUri, 'outbox'),
            type: ACTIVITY_TYPES.DELETE,
            object: appRegistration.id || appRegistration['@id'],
            to: appUri
          });

          if (this.broker.cacher) {
            // Invalidate all rights of the application on the Pod as they may now be completely different
            await ctx.call('webacl.cache.invalidateAllUserRightsOnPod', { webId: appUri, podOwner: emitterUri });
          }
        }
      }
    }
  }
};
