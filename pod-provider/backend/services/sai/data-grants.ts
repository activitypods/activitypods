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
      async handler(ctx: any) {
        const { accessNeedUri, podOwner } = ctx.params;

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
      async handler(ctx: any) {
        const { dataAuthorizationUri, podOwner } = ctx.params;

        const dataAuthorization = await ctx.call('data-authorizations.get', {
          resourceUri: dataAuthorizationUri,
          webId: podOwner
        });

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
