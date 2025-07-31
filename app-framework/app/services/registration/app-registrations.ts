import { ControlledContainerMixin, arrayOf } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';

/**
 * Mirror container for application registrations
 */
const AppRegistrationsSchema = {
  name: 'app-registrations',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:ApplicationRegistration'],
    newResourcesPermissions: {}
  },
  actions: {
    // Verify that the grants of an application registration match with the app's access needs
    async verify(ctx) {
      const { appRegistrationUri } = ctx.params;

      // Use local context to get all data
      const jsonContext = await ctx.call('jsonld.context.get');

      // Get from remote server, not local cache, to get latest version
      const appRegistration = await ctx.call('ldp.remote.getNetwork', {
        resourceUri: appRegistrationUri,
        jsonContext
      });

      const accessGrants = await Promise.all(
        arrayOf(appRegistration['interop:hasAccessGrant']).map(accessGrantUri =>
          ctx.call('ldp.remote.get', {
            resourceUri: accessGrantUri,
            jsonContext,
            accept: MIME_TYPES.JSON
          })
        )
      );

      const dataGrantsUris = accessGrants.reduce(
        (acc, cur) => (cur['interop:hasDataGrant'] ? [...acc, ...arrayOf(cur['interop:hasDataGrant'])] : acc),
        []
      );
      const specialRightsUris = accessGrants.reduce(
        (acc, cur) => (cur['apods:hasSpecialRights'] ? [...acc, ...arrayOf(cur['apods:hasSpecialRights'])] : acc),
        []
      );

      const dataGrants = await Promise.all(
        dataGrantsUris.map(dataGrantUri =>
          ctx.call('ldp.remote.get', {
            resourceUri: dataGrantUri,
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
        group =>
          arrayOf(group['interop:hasAccessNeed']).every(accessNeedUri =>
            dataGrants.some(dataGrant => dataGrant['interop:satisfiesAccessNeed'] === accessNeedUri)
          ) &&
          arrayOf(group['interop:hasSpecialRights']).every(specialRightUri =>
            specialRightsUris.some(sr => sr === specialRightUri)
          )
      );

      return { accessNeedsSatisfied, appRegistration, accessGrants, dataGrants };
    },
    async getForActor(ctx) {
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
    },
    async getRegisteredPods(ctx) {
      const filteredContainer = await this.actions.list({ webId: 'system' }, { parentCtx: ctx });

      return filteredContainer['ldp:contains']?.map(appRegistration => appRegistration['interop:registeredBy']);
    }
  },
  hooks: {
    after: {
      async delete(ctx, res) {
        const appRegistration = res.oldData;

        // DELETE ALL RELATED GRANTS

        for (const accessGrantUri of arrayOf(appRegistration['interop:hasAccessGrant'])) {
          const accessGrant = await ctx.call('access-grants.get', {
            resourceUri: accessGrantUri,
            webId: 'system'
          });

          for (const dataGrantUri of arrayOf(accessGrant['interop:hasDataGrant'])) {
            await ctx.call('data-grants.delete', {
              resourceUri: dataGrantUri,
              webId: 'system'
            });
          }

          await ctx.call('access-grants.delete', {
            resourceUri: accessGrantUri,
            webId: 'system'
          });
        }

        return res;
      }
    }
  }
};

export default AppRegistrationsSchema;
