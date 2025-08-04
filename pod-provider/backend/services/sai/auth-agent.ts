// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import { triple, namedNode } from '@rdfjs/data-model';
import { SingleResourceContainerMixin, getWebIdFromUri } from '@semapps/ldp';
// @ts-expect-error TS(1192): Module '"/home/laurin/projects/virtual-assembly/ac... Remove this comment to see the full error message
import * as CONFIG from '../../config/config.ts';
import { ServiceSchema, defineAction } from 'moleculer';

const AuthAgentSchema = {
  name: 'auth-agent' as const,
  // @ts-expect-error TS(2322): Type '{ mixins: { settings: { path: null; accepted... Remove this comment to see the full error message
  mixins: [SingleResourceContainerMixin],
  settings: {
    acceptedTypes: ['interop:AuthorizationAgent'],
    initialValue: {
      'interop:hasAuthorizationRedirectEndpoint': urlJoin(CONFIG.FRONTEND_URL, 'authorize'),
      'interop:hasDelegationIssuanceEndpoint': urlJoin(CONFIG.BASE_URL, '.auth-agent/delegation/issue')
    },
    podProvider: true,
    newResourcesPermissions: {
      anon: {
        read: true
      }
    }
  },
  actions: {
    getHeaderLinks: defineAction({
      // Action from the ControlledContainerMixin, called when we do GET or HEAD requests on resources
      async handler(ctx) {
        let agentRegistration;

        // @ts-expect-error TS(2339): Property 'impersonatedUser' does not exist on type... Remove this comment to see the full error message
        if (ctx.meta.impersonatedUser) {
          // The fetch is made by a registered app
          // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
          const agentUri = ctx.meta.webId;
          // @ts-expect-error TS(2339): Property 'impersonatedUser' does not exist on type... Remove this comment to see the full error message
          const podOwner = ctx.meta.impersonatedUser;
          agentRegistration = await ctx.call('app-registrations.getForAgent', { agentUri, podOwner });
        } else {
          // The fetch is made by a social agent
          // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
          const agentUri = ctx.meta.webId;
          const podOwner = getWebIdFromUri(ctx.params.uri);
          agentRegistration = await ctx.call('social-agent-registrations.getForAgent', { agentUri, podOwner });
        }

        if (agentRegistration) {
          return [
            {
              uri: agentRegistration['interop:registeredAgent'],
              // @ts-expect-error TS(2339): Property 'id' does not exist on type 'never'.
              anchor: agentRegistration.id || agentRegistration['@id'],
              rel: 'http://www.w3.org/ns/solid/interop#registeredAgent'
            }
          ];
        }
      }
    })
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
} satisfies ServiceSchema;

export default AuthAgentSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AuthAgentSchema.name]: typeof AuthAgentSchema;
    }
  }
}
