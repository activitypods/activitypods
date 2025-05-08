const path = require('path');
const LinkHeader = require('http-link-header');
const { ControlledContainerMixin, arrayOf, getId } = require('@semapps/ldp');
const { ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const AgentRegistrationsMixin = require('../../../mixins/agent-registrations');
const { arraysEqual } = require('../../../utils');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');

module.exports = {
  name: 'social-agent-registrations',
  mixins: [ControlledContainerMixin, AgentRegistrationsMixin, ActivitiesHandlerMixin],
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
  dependencies: ['api', 'ldp'],
  async started() {
    const basePath = await this.broker.call('ldp.getBasePath');
    await this.broker.call('api.addRoute', {
      route: {
        name: 'auth-agent-authorizations',
        path: path.join(basePath, '/.auth-agent/authorizations'),
        authorization: true,
        authentication: false,
        bodyParsers: {
          json: true
        },
        aliases: {
          'GET /': 'social-agent-registrations.getAuthorizations',
          'PUT /': 'social-agent-registrations.updateAuthorizations'
        }
      }
    });
  },
  actions: {
    async createOrUpdate(ctx) {
      let { agentUri, podOwner, accessGrantsUris, reciprocalRegistrationUri, label, note } = ctx.params;

      const agentRegistration = await this.actions.getForAgent({ agentUri, podOwner }, { parentCtx: ctx });

      if (!label) label = await this.actions.getAgentName({ agentUri, podOwner }, { parentCtx: ctx });

      if (agentRegistration) {
        // If some data has changed, update the registration
        if (
          (label && agentRegistration['skos:prefLabel'] !== label) ||
          (note && agentRegistration['skos:note'] !== note) ||
          (reciprocalRegistrationUri &&
            agentRegistration['interop:reciprocalRegistration'] !== reciprocalRegistrationUri) ||
          (accessGrantsUris && !arraysEqual(agentRegistration['interop:hasAccessGrant'], accessGrantsUris))
        ) {
          await this.actions.put(
            {
              resource: {
                ...agentRegistration,
                'interop:updatedAt': new Date().toISOString(),
                'interop:hasAccessGrant': accessGrantsUris || agentRegistration['interop:hasAccessGrant'],
                'interop:reciprocalRegistration':
                  reciprocalRegistrationUri || agentRegistration['interop:reciprocalRegistration'],
                'skos:prefLabel': label || agentRegistration['skos:prefLabel'],
                'skos:note': note || agentRegistration['skos:note']
              },
              contentType: MIME_TYPES.JSON,
              webId: podOwner
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
              'interop:hasAccessGrant': accessGrantsUris,
              'interop:reciprocalRegistration': reciprocalRegistrationUri,
              'skos:prefLabel': label,
              'skos:note': note
            },
            contentType: MIME_TYPES.JSON,
            webId: podOwner
          },
          { parentCtx: ctx }
        );

        // This shouldn't be necessary if we set excludeFromMirror to false
        await this.actions.notifyAgent(
          {
            agentRegistrationUri,
            agentUri,
            podOwner,
            activityType: ACTIVITY_TYPES.CREATE
          },
          { parentCtx: ctx }
        );

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
          await this.actions.createOrUpdate(
            {
              agentUri,
              podOwner,
              reciprocalRegistrationUri
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
    },
    async getAgentName(ctx) {
      const { agentUri, podOwner } = ctx.params;
      try {
        const agentProfile = await ctx.call('activitypub.actor.getProfile', {
          actorUri: agentUri,
          webId: podOwner
        });
        return agentProfile['vcard:given-name'];
      } catch (e) {
        // Can't get the private profile ? Use the webId
        const agent = await ctx.call('activitypub.actor.get', { actorUri: agentUri });
        return agent['foaf:name'] || agent.name || agent['foaf:nick'] || agent.preferredUsername;
      }
    },
    async notifyAgent(ctx) {
      const { agentRegistrationUri, agentUri, podOwner, activityType } = ctx.params;
      const agent = await ctx.call('activitypub.actor.get', { actorUri: agentUri });

      if (agent.inbox) {
        const outboxUri = await ctx.call('activitypub.actor.getCollectionUri', {
          actorUri: podOwner,
          predicate: 'outbox'
        });

        await ctx.call('activitypub.outbox.post', {
          collectionUri: outboxUri,
          type: activityType,
          object: agentRegistrationUri,
          to: agentUri
        });
      }
    },
    /**
     * Generate or regenerate a social agent registration based on their access grants
     */
    async regenerate(ctx) {
      const { agentUri, podOwner } = ctx.params;

      const accessGrants = await ctx.call('access-grants.getForAgent', { agentUri, podOwner });
      const accessGrantsUris = accessGrants.map(r => r.id || r['@id']);

      const agentRegistrationUri = await this.actions.createOrUpdate(
        { agentUri, podOwner, accessGrantsUris },
        { parentCtx: ctx }
      );

      return agentRegistrationUri;
    },
    // Add an authorization for a resource to a given user
    async addAuthorization(ctx) {
      const { resourceUri, grantee, accessModes, delegationAllowed, delegationLimit } = ctx.params;
      const webId = ctx.params.webId || ctx.meta.webId;

      await ctx.call('access-authorizations.generateForSingleResource', {
        resourceUri,
        grantee,
        accessModes,
        delegationAllowed,
        delegationLimit,
        webId
      });

      await this.actions.regenerate({ agentUri: grantee, podOwner: webId }, { parentCtx: ctx });
    },
    // Remove an authorization for a resource to a given user
    async removeAuthorization(ctx) {
      const { resourceUri, grantee } = ctx.params;
      const webId = ctx.params.webId || ctx.meta.webId;

      await ctx.call('access-authorizations.deleteForSingleResource', {
        resourceUri,
        grantee,
        webId
      });

      await this.actions.regenerate({ agentUri: grantee, podOwner: webId }, { parentCtx: ctx });
    },
    /**
     * Mass-update access authorizations for a single resource
     */
    async updateAuthorizations(ctx) {
      const { resourceUri, authorizations } = ctx.params;

      const podOwner = ctx.meta.webId;
      const account = await ctx.call('auth.account.findByWebId', { webId: podOwner });
      ctx.meta.dataset = account.username;

      for ({ grantee, accessModes } of authorizations) {
        if (accessModes.length > 0) {
          await ctx.call('access-authorizations.generateForSingleResource', {
            resourceUri,
            podOwner,
            grantee,
            accessModes
          });
        } else {
          await ctx.call('access-authorizations.deleteForSingleResource', {
            resourceUri,
            podOwner,
            grantee
          });
        }

        await this.actions.regenerate({ agentUri: grantee, podOwner }, { parentCtx: ctx });
      }
    },
    async getAuthorizations(ctx) {
      const { resource: resourceUri } = ctx.params;

      const webId = ctx.meta.webId;
      const account = await ctx.call('auth.account.findByWebId', { webId });
      ctx.meta.dataset = account.username;

      const dataAuthorizations = await ctx.call('data-authorizations.listForSingleResource', {
        resourceUri,
        webId
      });

      return {
        resourceUri,
        authorizations: dataAuthorizations.map(auth => ({
          grantee: auth['interop:grantee'],
          accessModes: arrayOf(auth['interop:accessMode'])
        }))
      };
    },
    // Get all data grants that have been shared with pod owner through reciprocal registration
    async getSharedDataGrants(ctx) {
      const { podOwner } = ctx.params;
      let dataGrants = [];

      const registrationsContainer = await this.actions.list({ webId: podOwner });

      for (const registration of arrayOf(registrationsContainer['ldp:contains'])) {
        if (registration['interop:reciprocalRegistration'] && registration['interop:registeredBy'] === podOwner) {
          const reciprocalRegistration = await this.actions.get({
            resourceUri: registration['interop:reciprocalRegistration'],
            webId: podOwner
          });

          dataGrants.push(
            ...(await this.actions.getDataGrants({ agentRegistration: reciprocalRegistration, podOwner }))
          );
        }
      }

      return dataGrants;
    },
    /**
     * Look at the provided social agent registration and, if needed,
     * generate delegated data grants for apps that requested 'interop:All' scope for the same data
     */
    async updateAppRegistrations(ctx) {
      const { socialAgentRegistration, podOwner } = ctx.params;
      let allGrantees = [];

      // Get all data grants from social agent registration (loop through access grants, then data grants)
      const dataGrants = await this.actions.getDataGrants({ agentRegistration: socialAgentRegistration });

      // TODO Filter out data grants which have not changed to improve performances

      for (const dataGrant of dataGrants) {
        // Generate delegated data grants for all data authorizations with `interop:All` scope
        const grantees = await ctx.call('delegated-data-grants.generateFromAllScopeAllDataAuthorizations', {
          dataGrant,
          podOwner: recipientUri
        });

        allGrantees.push(...grantees);
      }

      // Regenerate the app registrations (remove duplicate grantees)
      // TODO Also regenerate the social agent registrations
      for (const grantee of [...new Set(allGrantees)]) {
        await ctx.call('app-registrations.regenerate', {
          appUri: grantee,
          podOwner
        });
      }
    }
  },
  activities: {
    createAgentRegistration: {
      match: {
        type: ACTIVITY_TYPES.CREATE,
        object: {
          type: 'interop:SocialAgentRegistration'
        }
      },
      async onReceive(ctx, activity, recipientUri) {
        const socialAgentRegistration = activity.object;

        // Create a Social Agent Registration, if it doesn't exist yet
        await this.actions.createOrUpdate(
          {
            agentUri: activity.actor,
            podOwner: recipientUri,
            reciprocalRegistrationUri: getId(socialAgentRegistration)
          },
          { parentCtx: ctx }
        );
      }
    }
  }
};
