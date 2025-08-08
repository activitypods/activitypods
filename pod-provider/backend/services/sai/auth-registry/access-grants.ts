import { ControlledContainerMixin, getId } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';
import ImmutableContainerMixin from '../../../mixins/immutable-container-mixin.ts';
import AccessGrantsMixin from '../../../mixins/access-grants.ts';
import { ServiceSchema, defineAction } from 'moleculer';

const AccessGrantsSchema = {
  name: 'access-grants' as const,
  // @ts-expect-error TS(2322): Type '{ settings: { path: null; acceptedTypes: nul... Remove this comment to see the full error message
  mixins: [ImmutableContainerMixin, ControlledContainerMixin, AccessGrantsMixin],
  settings: {
    acceptedTypes: ['interop:AccessGrant'],
    excludeFromMirror: true,
    activateTombstones: false,
    typeIndex: 'private'
  },
  dependencies: ['ldp', 'ldp.registry'],
  actions: {
    generateFromAuthorization: defineAction({
      async handler(ctx) {
        const { authorization } = ctx.params;
        let replacedGrant;

        // Authorizations with scope interop:All map to grants with scope interop:AllFromRegistry
        const scopeOfGrant =
          authorization['interop:scopeOfAuthorization'] === 'interop:All'
            ? 'interop:AllFromRegistry'
            : authorization['interop:scopeOfAuthorization'];

        // If the authorization replaces another one, get the replaced grant
        if (authorization['interop:replaces']) {
          const replacedAuthorization = await ctx.call('access-authorizations.get', {
            resourceUri: authorization['interop:replaces'],
            webId: authorization['interop:dataOwner']
          });

          replacedGrant = await this.actions.getByAuthorization(
            { authorization: replacedAuthorization },
            { parentCtx: ctx }
          );
        }

        const grantUri = await this.actions.post(
          {
            resource: {
              ...authorization,
              id: undefined,
              type: 'interop:AccessGrant',
              'interop:grantedBy': authorization['interop:dataOwner'],
              'interop:scopeOfGrant': scopeOfGrant,
              'interop:scopeOfAuthorization': undefined,
              'interop:replaces': replacedGrant && getId(replacedGrant)
            },
            contentType: MIME_TYPES.JSON,
            webId: authorization['interop:dataOwner']
          },
          { parentCtx: ctx }
        );

        return grantUri;
      }
    }),

    getByAuthorization: defineAction({
      async handler(ctx) {
        const { authorization } = ctx.params;

        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#satisfiesAccessNeed': authorization['interop:satisfiesAccessNeed'],
              'http://www.w3.org/ns/solid/interop#dataOwner': authorization['interop:dataOwner'],
              'http://www.w3.org/ns/solid/interop#grantee': authorization['interop:grantee'],
              'http://www.w3.org/ns/solid/interop#hasDataRegistration': authorization['interop:hasDataRegistration']
            },
            webId: authorization['interop:dataOwner']
          },
          { parentCtx: ctx }
        );

        return filteredContainer['ldp:contains']?.[0];
      }
    }),

    getByResourceUri: defineAction({
      async handler(ctx) {
        const { resourceUri } = ctx.params;
        // @ts-expect-error TS(2339): Property 'webId' does not exist on type '{}'.
        const webId = ctx.params.webId || ctx.meta.webId || 'anon';

        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#hasDataInstance': resourceUri
            },
            webId
          },
          { parentCtx: ctx }
        );

        return filteredContainer['ldp:contains']?.[0];
      }
    })
  }
} satisfies ServiceSchema;

export default AccessGrantsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AccessGrantsSchema.name]: typeof AccessGrantsSchema;
    }
  }
}
