import { ControlledContainerMixin, arrayOf } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';
// @ts-expect-error TS(2305): Module '"moleculer"' has no exported member 'defin... Remove this comment to see the full error message
import { ServiceSchema, defineAction } from 'moleculer';

/**
 * Mirror container for application registrations
 */
const AppRegistrationsSchema = {
  name: 'app-registrations' as const,
  // @ts-expect-error TS(2322): Type '{ settings: { path: null; acceptedTypes: nul... Remove this comment to see the full error message
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:ApplicationRegistration'],
    newResourcesPermissions: {}
  },
  actions: {
    verify: defineAction({
      // Verify that the grants of an application registration match with the app's access needs
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        const { appRegistrationUri } = ctx.params;

        // Use local context to get all data
        const jsonContext = await ctx.call('jsonld.context.get');

        // Get from remote server, not local cache, to get latest version
        const appRegistration = await ctx.call('ldp.remote.getNetwork', {
          resourceUri: appRegistrationUri,
          jsonContext
        });

        const accessGrants = await Promise.all(
          arrayOf(appRegistration['interop:hasAccessGrant']).map((grantUri: any) =>
            ctx.call('ldp.remote.get', {
              resourceUri: grantUri,
              jsonContext,
              accept: MIME_TYPES.JSON
            })
          )
        );

        // Get required access need group(s)
        const filteredContainer = await ctx.call('access-needs-groups.list', {
          filters: {
            'http://www.w3.org/ns/solid/interop#accessNecessity': 'http://www.w3.org/ns/solid/interop#AccessRequired'
          },
          accept: MIME_TYPES.JSON
        });
        const requiredAccessNeedGroups = arrayOf(filteredContainer['ldp:contains']);

        // Return true if all access needs and special rights of the required AccessNeedGroup(s) are granted
        const accessNeedsSatisfied = requiredAccessNeedGroups.every(
          (group: any) =>
            arrayOf(group['interop:hasAccessNeed']).every((accessNeedUri: any) =>
              accessGrants.some((grant: any) => grant['interop:satisfiesAccessNeed'] === accessNeedUri)
            ) &&
            arrayOf(group['interop:hasSpecialRights']).every((specialRightUri: any) =>
              appRegistration['apods:hasSpecialRights'].some((sr: any) => sr === specialRightUri)
            )
        );

        return { accessNeedsSatisfied, appRegistration, accessGrants };
      }
    }),

    getForActor: defineAction({
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        const { actorUri } = ctx.params;

        const filteredContainer = await this.actions.list(
          {
            filters: {
              'http://www.w3.org/ns/solid/interop#registeredBy': actorUri
            },
            webId: 'system'
          },
          { parentCtx: ctx }
        );

        return filteredContainer['ldp:contains']?.[0];
      }
    }),

    getRegisteredPods: defineAction({
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        const filteredContainer = await this.actions.list({ webId: 'system' }, { parentCtx: ctx });

        return filteredContainer['ldp:contains']?.map(
          (appRegistration: any) => appRegistration['interop:registeredBy']
        );
      }
    })
  },
  hooks: {
    after: {
      async delete(ctx, res) {
        const appRegistration = res.oldData;

        for (const accessGrantUri of arrayOf(appRegistration['interop:hasAccessGrant'])) {
          await ctx.call('access-grants.delete', {
            resourceUri: accessGrantUri,
            webId: 'system'
          });
        }

        return res;
      }
    }
  }
} satisfies ServiceSchema;

export default AppRegistrationsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AppRegistrationsSchema.name]: typeof AppRegistrationsSchema;
    }
  }
}
