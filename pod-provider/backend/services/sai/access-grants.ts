import { ControlledContainerMixin, arrayOf } from '@semapps/ldp';
import { ServiceSchema, defineAction } from 'moleculer';

const AccessGrantsServiceSchema = {
  name: 'access-grants' as const,
  mixins: [ControlledContainerMixin],

  settings: {
    acceptedTypes: ['interop:AccessGrant'],
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
    put: defineAction({
      handler() {
        throw new Error(`The resources of type interop:AccessGrant are immutable`);
      }
    }),

    patch: defineAction({
      handler() {
        throw new Error(`The resources of type interop:AccessGrant are immutable`);
      }
    }),

    getForApp: defineAction({
      // Get all the AccessGrants granted to an application
      async handler(ctx: any) {
        const { appUri, podOwner } = ctx.params;

        const containerUri = await this.actions.getContainerUri({ webId: podOwner }, { parentCtx: ctx });

        const filteredContainer = await this.actions.list(
          {
            containerUri,
            filters: {
              'http://www.w3.org/ns/solid/interop#grantedBy': podOwner,
              'http://www.w3.org/ns/solid/interop#grantee': appUri
            },
            webId: 'system'
          },
          { parentCtx: ctx }
        );

        return arrayOf(filteredContainer['ldp:contains']);
      }
    }),

    getByAccessNeedGroup: defineAction({
      // Get the AccessGrant linked with an AccessNeedGroup
      async handler(ctx: any) {
        const { accessNeedGroupUri, podOwner } = ctx.params;

        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#grantedBy': podOwner,
              'http://www.w3.org/ns/solid/interop#hasAccessNeedGroup': accessNeedGroupUri
            },
            webId: podOwner
          },
          { parentCtx: ctx }
        );

        return filteredContainer['ldp:contains']?.[0];
      }
    })
  }
} satisfies ServiceSchema;

export default AccessGrantsServiceSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AccessGrantsServiceSchema.name]: typeof AccessGrantsServiceSchema;
    }
  }
}
