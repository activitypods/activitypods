import urlJoin from 'url-join';
import rdf from '@rdfjs/data-model';
import { ControlledResourceMixin } from '@semapps/ldp';
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema } from 'moleculer';

const AuthAgentSchema = {
  name: 'auth-agent' as const,
  // @ts-expect-error TS(2322): Type '{ mixins: { settings: { path: null; accepted... Remove this comment to see the full error message
  mixins: [ControlledResourceMixin],
  settings: {
    path: '/auth-agent',
    types: ['interop:AuthorizationAgent'],
    permissions: {
      anon: {
        read: true
      }
    },
    typeIndex: 'private'
  },
  actions: {
    getHeaderLinks: {
      // Action from the ControlledContainerMixin, called when we do GET or HEAD requests on resources
      async handler(ctx: any) {
        let agentRegistration;

        if (ctx.meta.impersonatedUser) {
          // The fetch is made by a registered app
          agentRegistration = await ctx.call('app-registrations.getForAgent', { agentUri: ctx.meta.webId });
        } else {
          // The fetch is made by a social agent
          agentRegistration = await ctx.call('social-agent-registrations.getForAgent', { agentUri: ctx.meta.webId });
        }

        if (agentRegistration) {
          return [
            {
              uri: agentRegistration['interop:registeredAgent'],
              anchor: agentRegistration.id || agentRegistration['@id'],
              rel: 'http://www.w3.org/ns/solid/interop#registeredAgent'
            }
          ];
        }
      }
    }
  },
  hooks: {
    before: {
      async create(ctx) {
        ctx.params.resource['interop:hasAuthorizationRedirectEndpoint'] = urlJoin(CONFIG.FRONTEND_URL!, 'authorize');
        ctx.params.resource['interop:hasDelegationIssuanceEndpoint'] = urlJoin(
          CONFIG.BASE_URL!,
          '.auth-agent/delegation/issue'
        );
      }
    }
  },
  events: {
    'webid.created': {
      async handler(ctx: any) {
        const { resourceUri: webId } = ctx.params;
        const authAgentUri = await this.actions.waitForCreation({}, { parentCtx: ctx });
        await ctx.call('ldp.resource.patch', {
          resourceUri: webId,
          triplesToAdd: [
            rdf.quad(
              rdf.namedNode(webId),
              rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAuthorizationAgent'),
              rdf.namedNode(authAgentUri)
            )
          ],
          webId: 'system'
        });
      }
    }
  }
} satisfies ServiceSchema;

export default AuthAgentSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AuthAgentSchema.name]: typeof AuthAgentSchema;
    }
  }
}
