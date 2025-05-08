const path = require('path');
const urlJoin = require('url-join');
const { MoleculerError } = require('moleculer').Errors;
const { ACTIVITY_TYPES } = require('@semapps/activitypub');
const { ControlledContainerMixin } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const AgentRegistrationsMixin = require('../../../mixins/agent-registrations');
const { arraysEqual } = require('../../../utils');

module.exports = {
  name: 'app-registrations',
  mixins: [ControlledContainerMixin, AgentRegistrationsMixin],
  settings: {
    acceptedTypes: ['interop:ApplicationRegistration'],
    newResourcesPermissions: {
      anon: {
        read: true
      }
    },
    excludeFromMirror: true,
    activateTombstones: false,
    typeIndex: 'private'
  },
  dependencies: ['api', 'ldp'],
  async started() {
    const basePath = await this.broker.call('ldp.getBasePath');
    await this.broker.call('api.addRoute', {
      route: {
        name: 'auth-agent-app-registration',
        path: path.join(basePath, '/.auth-agent/app-registrations'),
        authorization: true,
        authentication: false,
        bodyParsers: {
          json: true
        },
        aliases: {
          'POST /register': 'app-registrations.register',
          'POST /upgrade': 'app-registrations.upgrade',
          'POST /remove': 'app-registrations.remove'
        }
      }
    });
  },
  actions: {
    async createOrUpdate(ctx) {
      const { appUri, podOwner, accessGrantsUris } = ctx.params;

      const appRegistration = await this.actions.getForAgent({ agentUri: appUri, podOwner }, { parentCtx: ctx });

      if (appRegistration) {
        if (!arraysEqual(appRegistration['interop:hasAccessGrant'], accessGrantsUris)) {
          await this.actions.put(
            {
              resource: {
                ...appRegistration,
                'interop:updatedAt': new Date().toISOString(),
                'interop:hasAccessGrant': accessGrantsUris
              },
              contentType: MIME_TYPES.JSON
            },
            { parentCtx: ctx }
          );
        }

        return appRegistration.id;
      } else {
        const appRegistrationUri = await this.actions.post(
          {
            resource: {
              type: 'interop:ApplicationRegistration',
              'interop:registeredBy': podOwner,
              'interop:registeredWith': await ctx.call('auth-agent.getResourceUri', { webId: podOwner }),
              'interop:registeredAt': new Date().toISOString(),
              'interop:updatedAt': new Date().toISOString(),
              'interop:registeredAgent': appUri,
              'interop:hasAccessGrant': accessGrantsUris
            },
            contentType: MIME_TYPES.JSON
          },
          { parentCtx: ctx }
        );

        return appRegistrationUri;
      }
    },
    /**
     * Generate or regenerate an app registration based on their access grants
     */
    async regenerate(ctx) {
      const { appUri, podOwner } = ctx.params;

      // Retrieve the AccessGrants (which may, or may not, have changed)
      const accessGrants = await ctx.call('access-grants.getForAgent', { agentUri: appUri, podOwner });
      const accessGrantsUris = accessGrants.map(r => r.id || r['@id']);

      const appRegistrationUri = await this.actions.createOrUpdate(
        { appUri, podOwner, accessGrantsUris },
        { parentCtx: ctx }
      );

      return appRegistrationUri;
    },
    async register(ctx) {
      let { appUri, acceptedAccessNeeds, acceptedSpecialRights, acceptAllRequirements = false } = ctx.params;

      const webId = ctx.meta.webId;
      const account = await ctx.call('auth.account.findByWebId', { webId });
      ctx.meta.dataset = account.username;

      // Force to get through network
      const app = await ctx.call('ldp.remote.getNetwork', { resourceUri: appUri });

      const appRegistration = await ctx.call('app-registrations.getForAgent', { agentUri: appUri, podOwner: webId });

      if (appRegistration) {
        throw new MoleculerError(
          `User already has an application registration. Upgrade or uninstall the app first.`,
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

      await ctx.call('access-authorizations.generateFromAccessNeedGroups', {
        accessNeedGroups: app['interop:hasAccessNeedGroup'],
        acceptedAccessNeeds,
        acceptedSpecialRights,
        podOwner: webId,
        appUri
      });

      const appRegistrationUri = await this.actions.regenerate(
        {
          appUri,
          podOwner: webId
        },
        { parentCtx: ctx }
      );

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
      let { appUri, acceptedAccessNeeds, acceptedSpecialRights, acceptAllRequirements = false } = ctx.params;

      const webId = ctx.meta.webId;
      const account = await ctx.call('auth.account.findByWebId', { webId });
      ctx.meta.dataset = account.username;

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

      await ctx.call('access-authorizations.generateFromAccessNeedGroups', {
        accessNeedGroups: app['interop:hasAccessNeedGroup'],
        acceptedAccessNeeds,
        acceptedSpecialRights,
        podOwner: webId,
        appUri
      });

      const appRegistrationUri = await this.actions.regenerate(
        {
          appUri,
          podOwner: webId
        },
        { parentCtx: ctx }
      );

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
    async remove(ctx) {
      const { appUri } = ctx.params;

      const webId = ctx.meta.webId;
      const account = await ctx.call('auth.account.findByWebId', { webId });
      ctx.meta.dataset = account.username;

      const app = await ctx.call('applications.get', { appUri, webId });
      const appRegistration = await ctx.call('app-registrations.getForAgent', { agentUri: appUri, podOwner: webId });

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
        const appUri = ctx.params.resource['interop:registeredAgent'];
        const webId = ctx.params.resource['interop:registeredBy'];

        // Keep in cache the Application resource. This is useful for:
        // - Display the application details in the app store even if it's offline
        // - Known when the app must be upgraded by comparing the dc:modified predicate
        await ctx.call('ldp.remote.store', { resourceUri: appUri, webId });
        await ctx.call('applications.attach', { resourceUri: appUri, webId });

        return res;
      },
      async put(ctx, res) {
        // Update the Application resource kept in cache
        const appUri = ctx.params.resource['interop:registeredAgent'];
        const webId = ctx.params.resource['interop:registeredBy'];
        await ctx.call('ldp.remote.store', { resourceUri: appUri, webId });

        return res;
      },
      async delete(ctx, res) {
        // Delete Application resource kept in cache
        const appUri = res.oldData['interop:registeredAgent'];
        await ctx.call('applications.delete', { resourceUri: appUri });

        return res;
      }
    }
  }
};
