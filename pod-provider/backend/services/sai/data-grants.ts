// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { ControlledContainerMixin } from '@semapps/ldp';
import { ServiceSchema, defineAction } from 'moleculer';

const DataGrantsServiceSchema = {
  name: 'data-grants' as const,
  mixins: [ControlledContainerMixin],

  settings: {
    acceptedTypes: ['interop:DataGrant'],
    newResourcesPermissions: {
      anon: {
        read: true
      }
    },
    excludeFromMirror: true,
    activateTombstones: false,
    typeIndex: 'private'
  },

  dependencies: ['ldp', 'ldp.registry'],

  actions: {
    put: defineAction({
      handler() {
        throw new Error(`The resources of type interop:DataGrant are immutable`);
      }
    }),

    patch: defineAction({
      handler() {
        throw new Error(`The resources of type interop:DataGrant are immutable`);
      }
    }),

    getByAccessNeed: defineAction({
      // Get the DataGrant linked with an AccessNeed
      // @ts-expect-error TS(7023): 'getByAccessNeed' implicitly has return type 'any'... Remove this comment to see the full error message
      async handler(ctx: any) {
        const { accessNeedUri, podOwner } = ctx.params;

        // @ts-expect-error TS(7022): 'filteredContainer' implicitly has type 'any' beca... Remove this comment to see the full error message
        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#satisfiesAccessNeed': accessNeedUri,
              'http://www.w3.org/ns/solid/interop#dataOwner': podOwner
            },
            webId: podOwner
          },
          { parentCtx: ctx }
        );

        return filteredContainer['ldp:contains']?.[0];
      }
    }),

    getByDataAuthorization: defineAction({
      // @ts-expect-error TS(7023): 'getByDataAuthorization' implicitly has return typ... Remove this comment to see the full error message
      async handler(ctx: any) {
        const { dataAuthorizationUri, podOwner } = ctx.params;

        const dataAuthorization = await ctx.call('data-authorizations.get', {
          resourceUri: dataAuthorizationUri,
          webId: podOwner
        });

        // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ put()... Remove this comment to see the full error message
        return await this.actions.getByAccessNeed(
          { accessNeedUri: dataAuthorization['interop:satisfiesAccessNeed'], podOwner },
          { parentCtx: ctx }
        );
      }
    })
  }
} satisfies ServiceSchema;

export default DataGrantsServiceSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [DataGrantsServiceSchema.name]: typeof DataGrantsServiceSchema;
    }
  }
}
