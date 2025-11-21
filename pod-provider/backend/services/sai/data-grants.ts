import { ServiceSchema } from 'moleculer';
import { ControlledContainerMixin } from '@semapps/ldp';

const DataGrantsService = {
  name: 'data-grants' as const,
  // @ts-expect-error TS(2322): Type '{ settings: { path: null; types: nul... Remove this comment to see the full error message
  mixins: [ControlledContainerMixin],
  settings: {
    types: ['interop:DataGrant'],
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
    put() {
      throw new Error(`The resources of type interop:DataGrant are immutable`);
    },
    patch() {
      throw new Error(`The resources of type interop:DataGrant are immutable`);
    },
    // Get the DataGrant linked with an AccessNeed
    async getByAccessNeed(ctx) {
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
    },
    async getByDataAuthorization(ctx) {
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
  }
} satisfies ServiceSchema;

export default DataGrantsService;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [DataGrantsService.name]: typeof DataGrantsService;
    }
  }
}
