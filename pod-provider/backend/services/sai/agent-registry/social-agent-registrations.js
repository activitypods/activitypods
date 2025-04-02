const LinkHeader = require('http-link-header');
const { ControlledContainerMixin } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const AgentRegistrationsMixin = require('../../../mixins/agent-registrations');

module.exports = {
  name: 'social-agent-registrations',
  mixins: [ControlledContainerMixin, AgentRegistrationsMixin],
  settings: {
    acceptedTypes: ['interop:SocialAgentRegistration'],
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
      const { agentUri, podOwner, label, note } = ctx.params;

      const agentRegistration = await this.actions.getForAgent({ agentUri, podOwner }, { parentCtx: ctx });

      if (agentRegistration) {
        // If the label or note has changed, update the registration
        if (agentRegistration['skos:prefLabel'] !== label && agentRegistration['skos:note'] !== note) {
          await this.actions.put(
            {
              resource: {
                ...agentRegistration,
                'interop:updatedAt': new Date().toISOString(),
                'skos:prefLabel': label,
                'skos:note': note
              },
              contentType: MIME_TYPES.JSON
            },
            { parentCtx: ctx }
          );
        }

        return agentRegistration.id;
      } else {
        const agentRegistrationUri = await this.actions.post(
          {
            resource: {
              type: 'interop:SocialAgentRegistration',
              'interop:registeredBy': podOwner,
              'interop:registeredWith': await ctx.call('auth-agent.getResourceUri', { webId: podOwner }),
              'interop:registeredAt': new Date().toISOString(),
              'interop:updatedAt': new Date().toISOString(),
              'interop:registeredAgent': agentUri,
              'skos:prefLabel': label,
              'skos:note': note
            },
            contentType: MIME_TYPES.JSON
          },
          { parentCtx: ctx }
        );

        await this.actions.addReciprocalRegistration({ agentUri, podOwner }, { parentCtx: ctx });

        return agentRegistrationUri;
      }
    },
    async addReciprocalRegistration(ctx) {
      const { agentUri, podOwner } = ctx.params;

      const agentRegistration = await this.actions.getForAgent({ agentUri, podOwner }, { parentCtx: ctx });

      // If no reciprocal registration exist, try to find it
      if (!agentRegistration['interop:reciprocalRegistration']) {
        const reciprocalRegistrationUri = await this.actions.getReciprocalRegistrationUri(
          { agentUri, podOwner },
          { parentCtx: ctx }
        );

        // If a reciprocal registration was found, persist it
        if (reciprocalRegistrationUri) {
          await this.actions.put(
            {
              resource: {
                ...agentRegistration,
                'interop:updatedAt': new Date().toISOString(),
                'interop:reciprocalRegistration': reciprocalRegistrationUri
              },
              contentType: MIME_TYPES.JSON
            },
            { parentCtx: ctx }
          );
        }
      }
    },
    // Find reciprocal registration using Agent Registration Discovery
    // https://solid.github.io/data-interoperability-panel/specification/#agent-registration-discovery
    async getReciprocalRegistrationUri(ctx) {
      const { agentUri, podOwner } = ctx.params;

      const agent = await ctx.call('activitypub.actor.get', { actorUri: agentUri });
      const authAgentUri = agent['interop:hasAuthorizationAgent'];

      if (!authAgentUri) throw new Error(`No authorization agent associated with agent ${agentUri}`);

      const response = await ctx.call('signature.proxy.query', {
        url: authAgentUri,
        method: 'HEAD',
        actorUri: podOwner
      });

      const linkHeader = LinkHeader.parse(response.headers.link);
      const registeredAgentLinkHeader = linkHeader.rel('http://www.w3.org/ns/solid/interop#registeredAgent');

      if (registeredAgentLinkHeader.length > 0) {
        return registeredAgentLinkHeader[0].anchor;
      }
    }
  }
};
