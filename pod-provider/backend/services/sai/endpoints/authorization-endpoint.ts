import path from 'path';
const { MoleculerError } = require('moleculer').Errors;
import { arrayOf } from '@semapps/ldp';
import { ServiceSchema, defineAction } from 'moleculer';

const AuthorizationEndpointSchema = {
  name: 'authorization-endpoint' as const,
  dependencies: ['api', 'ldp'],
  async started() {
    const basePath = await this.broker.call('ldp.getBasePath');
    await this.broker.call('api.addRoute', {
      route: {
        name: 'sai-authorization-endpoint',
        path: path.join(basePath, '/.auth-agent/authorizations'),
        authorization: true,
        authentication: false,
        bodyParsers: {
          json: true
        },
        aliases: {
          'GET /': 'authorization-endpoint.getAuthorizations',
          'PUT /': 'authorization-endpoint.updateAuthorizations'
        }
      }
    });
  },
  actions: {
    getAuthorizations: defineAction({
      async handler(ctx) {
        const { resource: resourceUri } = ctx.params;

        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.meta.webId;
        const account = await ctx.call('auth.account.findByWebId', { webId });
        // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
        ctx.meta.dataset = account.username;

        if (!resourceUri.startsWith(`${webId}/`))
          throw new MoleculerError('Only the owner of a resource can fetch its authorizations', 403, 'FORBIDDEN');

        const authorizations = await ctx.call('access-authorizations.listForSingleResource', { resourceUri });

        return {
          resourceUri,
          // @ts-expect-error TS(2339): Property 'map' does not exist on type 'never'.
          authorizations: authorizations.map((authorization: any) => ({
            grantee: authorization['interop:grantee'],
            accessModes: arrayOf(authorization['interop:accessMode'])
          }))
        };
      }
    }),

    updateAuthorizations: defineAction({
      /**
       * Mass-update access authorizations for a single resource
       */
      async handler(ctx) {
        const { resourceUri, authorizations } = ctx.params;

        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const podOwner = ctx.meta.webId;
        const account = await ctx.call('auth.account.findByWebId', { webId: podOwner });
        // @ts-expect-error TS(2339): Property 'dataset' does not exist on type '{}'.
        ctx.meta.dataset = account.username;

        if (!resourceUri.startsWith(`${podOwner}/`))
          throw new MoleculerError('Only the owner of a resource can update its authorizations', 403, 'FORBIDDEN');

        // @ts-expect-error TS(18004): No value exists in scope for the shorthand propert... Remove this comment to see the full error message
        for ({ grantee, accessModes } of authorizations) {
          // @ts-expect-error TS(2304): Cannot find name 'accessModes'.
          if (accessModes.length > 0) {
            await ctx.call('access-authorizations.addForSingleResource', {
              resourceUri,
              podOwner,
              // @ts-expect-error TS(18004): No value exists in scope for the shorthand propert... Remove this comment to see the full error message
              grantee,
              // @ts-expect-error TS(18004): No value exists in scope for the shorthand propert... Remove this comment to see the full error message
              accessModes
            });
          } else {
            await ctx.call('access-authorizations.removeForSingleResource', {
              resourceUri,
              podOwner,
              // @ts-expect-error TS(18004): No value exists in scope for the shorthand propert... Remove this comment to see the full error message
              grantee
            });
          }
        }
      }
    })
  }
} satisfies ServiceSchema;

export default AuthorizationEndpointSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AuthorizationEndpointSchema.name]: typeof AuthorizationEndpointSchema;
    }
  }
}
