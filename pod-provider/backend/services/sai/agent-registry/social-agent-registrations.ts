import LinkHeader from 'http-link-header';
import { ControlledContainerMixin, arrayOf, getId } from '@semapps/ldp';
import { ActivitiesHandlerMixin } from '@semapps/activitypub';
import { MIME_TYPES } from '@semapps/mime-types';
import AgentRegistrationsMixin from '../../../mixins/agent-registrations.ts';
import { ACTIVITY_TYPES } from '@semapps/activitypub';
import { ServiceSchema, defineAction } from 'moleculer';

const SocialAgentRegistrationsSchema = {
  name: 'social-agent-registrations' as const,
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
  actions: {
    createOrUpdate: defineAction({
      async handler(ctx) {
        let { agentUri, podOwner, reciprocalRegistrationUri, label, note } = ctx.params;

        const agentRegistration = await this.actions.getForAgent({ agentUri, podOwner }, { parentCtx: ctx });

        if (!label) label = await this.actions.getAgentName({ agentUri, podOwner }, { parentCtx: ctx });

        if (agentRegistration) {
          // If some data has changed, update the registration
          if (
            (label && agentRegistration['skos:prefLabel'] !== label) ||
            (note && agentRegistration['skos:note'] !== note) ||
            (reciprocalRegistrationUri &&
              agentRegistration['interop:reciprocalRegistration'] !== reciprocalRegistrationUri)
          ) {
            await this.actions.put(
              {
                resource: {
                  ...agentRegistration,
                  'interop:updatedAt': new Date().toISOString(),
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
      }
    }),

    addReciprocalRegistration: defineAction({
      async handler(ctx) {
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
      }
    }),

    getReciprocalRegistrationUri: defineAction({
      // Find reciprocal registration using Agent Registration Discovery
      // https://solid.github.io/data-interoperability-panel/specification/#agent-registration-discovery
      async handler(ctx) {
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
    }),

    getAgentName: defineAction({
      async handler(ctx) {
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
      }
    }),

    notifyAgent: defineAction({
      async handler(ctx) {
        const { agentRegistrationUri, agentUri, podOwner, activityType } = ctx.params;
        const agent = await ctx.call('activitypub.actor.get', { actorUri: agentUri });

        if (agent.inbox) {
          const outboxUri = await ctx.call('activitypub.actor.getCollectionUri', {
            actorUri: podOwner,
            predicate: 'outbox'
          });

          await ctx.call(
            'activitypub.outbox.post',
            {
              collectionUri: outboxUri,
              type: activityType,
              object: agentRegistrationUri,
              to: agentUri,
              transient: true
            },
            { meta: { webId: podOwner } }
          );
        }
      }
    }),

    getSharedGrants: defineAction({
      // Get all access grants that have been shared with pod owner through reciprocal registration
      async handler(ctx) {
        const { podOwner } = ctx.params;
        let grants = [];

        const registrationsContainer = await this.actions.list({ webId: podOwner });

        for (const registration of arrayOf(registrationsContainer['ldp:contains'])) {
          if (registration['interop:reciprocalRegistration'] && registration['interop:registeredBy'] === podOwner) {
            const reciprocalRegistration = await this.actions.get({
              resourceUri: registration['interop:reciprocalRegistration'],
              webId: podOwner
            });

            grants.push(...(await this.actions.getGrants({ agentRegistration: reciprocalRegistration, podOwner })));
          }
        }

        return grants;
      }
    }),

    updateAppRegistrations: defineAction({
      /**
       * Look at the provided social agent registration and, if needed,
       * generate delegated grants for apps that requested 'interop:All' scope for the same data
       */
      async handler(ctx) {
        const { socialAgentRegistration, podOwner } = ctx.params;

        // Get all grants from agent registration
        const grants = await this.actions.getGrants({ agentRegistration: socialAgentRegistration });

        // TODO Filter out grants which have not changed to improve performances

        for (const grant of grants) {
          // Generate delegated grants for all authorizations with `interop:All` scope
          await ctx.call('delegated-access-grants.generateFromAllScopeAllAuthorizations', {
            grant,
            podOwner
          });
        }
      }
    })
  },
  activities: {
    createAgentRegistration: {
      match: {
        type: ACTIVITY_TYPES.CREATE,
        object: {
          type: 'interop:SocialAgentRegistration'
        }
      },
      async onReceive(ctx: any, activity: any, recipientUri: any) {
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
} satisfies ServiceSchema;

export default SocialAgentRegistrationsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [SocialAgentRegistrationsSchema.name]: typeof SocialAgentRegistrationsSchema;
    }
  }
}
