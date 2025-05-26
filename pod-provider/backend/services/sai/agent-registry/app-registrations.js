const { ControlledContainerMixin, getId } = require('@semapps/ldp');
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
  actions: {
    async createOrUpdate(ctx) {
      const { agentUri, podOwner, specialRightsUris } = ctx.params;

      const appRegistration = await this.actions.getForAgent({ agentUri, podOwner }, { parentCtx: ctx });

      if (appRegistration) {
        if (!arraysEqual(appRegistration['apods:hasSpecialRights'], specialRightsUris)) {
          await this.actions.put(
            {
              resource: {
                ...appRegistration,
                'interop:updatedAt': new Date().toISOString(),
                'apods:hasSpecialRights': specialRightsUris
              },
              contentType: MIME_TYPES.JSON
            },
            { parentCtx: ctx }
          );
        }

        return getId(appRegistration);
      } else {
        const appRegistrationUri = await this.actions.post(
          {
            resource: {
              type: 'interop:ApplicationRegistration',
              'interop:registeredBy': podOwner,
              'interop:registeredWith': await ctx.call('auth-agent.getResourceUri', { webId: podOwner }),
              'interop:registeredAt': new Date().toISOString(),
              'interop:updatedAt': new Date().toISOString(),
              'interop:registeredAgent': agentUri,
              'apods:hasSpecialRights': specialRightsUris
            },
            contentType: MIME_TYPES.JSON
          },
          { parentCtx: ctx }
        );

        return appRegistrationUri;
      }
    }
  },
  hooks: {
    after: {
      async post(ctx, res) {
        const appUri = ctx.params.resource['interop:registeredAgent'];
        const webId = ctx.params.resource['interop:registeredBy'];

        // Keep in cache the Application resource. This is useful to:
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
