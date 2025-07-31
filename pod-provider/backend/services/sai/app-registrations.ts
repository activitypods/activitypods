// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { ControlledContainerMixin, arrayOf } from '@semapps/ldp';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { MIME_TYPES } from '@semapps/mime-types';

export default {
  name: 'app-registrations',
  mixins: [ControlledContainerMixin],
  settings: {
    acceptedTypes: ['interop:ApplicationRegistration'],
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
    // @ts-expect-error TS(7023): 'createOrUpdate' implicitly has return type 'any' ... Remove this comment to see the full error message
    async createOrUpdate(ctx: any) {
      const { appUri, podOwner, acceptedAccessNeeds, acceptedSpecialRights } = ctx.params;

      // First clean up orphans grants. This will remove all associated rights before they are added back below.
      await ctx.call('data-authorizations.deleteOrphans', { appUri, podOwner });
      await ctx.call('access-authorizations.deleteOrphans', { appUri, podOwner });

      // Get the app from the remote server, not the local cache
      const app = await ctx.call('ldp.remote.getNetwork', { resourceUri: appUri });

      // Generate AccessAuthorizations, DataAuthorizations, AccessGrants and DataGrants, unless they already exists
      await ctx.call('access-authorizations.generateFromAccessNeedGroups', {
        accessNeedGroups: app['interop:hasAccessNeedGroup'],
        acceptedAccessNeeds,
        acceptedSpecialRights,
        podOwner,
        appUri
      });

      // Retrieve the AccessGrants (which may, or may not, have changed)
      const accessGrants = await ctx.call('access-grants.getForApp', { appUri, podOwner });

      // @ts-expect-error TS(7022): 'appRegistration' implicitly has type 'any' becaus... Remove this comment to see the full error message
      const appRegistration = await this.actions.getForApp({ appUri, podOwner }, { parentCtx: ctx });

      if (appRegistration) {
        // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ creat... Remove this comment to see the full error message
        await this.actions.put(
          {
            resource: {
              ...appRegistration,
              'interop:updatedAt': new Date().toISOString(),
              'interop:hasAccessGrant': accessGrants.map((r: any) => r.id || r['@id'])
            },
            contentType: MIME_TYPES.JSON
          },
          { parentCtx: ctx }
        );

        return appRegistration.id;
      } else {
        // @ts-expect-error TS(7022): 'appRegistrationUri' implicitly has type 'any' bec... Remove this comment to see the full error message
        const appRegistrationUri = await this.actions.post(
          {
            resource: {
              type: 'interop:ApplicationRegistration',
              'interop:registeredBy': podOwner,
              'interop:registeredWith': await ctx.call('auth-agent.getResourceUri', { webId: podOwner }),
              'interop:registeredAt': new Date().toISOString(),
              'interop:updatedAt': new Date().toISOString(),
              'interop:registeredAgent': appUri,
              'interop:hasAccessGrant': accessGrants.map((r: any) => r.id || r['@id'])
            },
            contentType: MIME_TYPES.JSON
          },
          { parentCtx: ctx }
        );

        return appRegistrationUri;
      }
    },
    // @ts-expect-error TS(7023): 'getForApp' implicitly has return type 'any' becau... Remove this comment to see the full error message
    async getForApp(ctx: any) {
      const { appUri, podOwner } = ctx.params;

      // @ts-expect-error TS(7022): 'containerUri' implicitly has type 'any' because i... Remove this comment to see the full error message
      const containerUri = await this.actions.getContainerUri({ webId: podOwner }, { parentCtx: ctx });

      // @ts-expect-error TS(7022): 'filteredContainer' implicitly has type 'any' beca... Remove this comment to see the full error message
      const filteredContainer = await this.actions.list(
        {
          containerUri,
          filters: {
            'http://www.w3.org/ns/solid/interop#registeredAgent': appUri,
            'http://www.w3.org/ns/solid/interop#registeredBy': podOwner
          },
          webId: 'system'
        },
        { parentCtx: ctx }
      );

      return filteredContainer['ldp:contains']?.[0];
    },
    // @ts-expect-error TS(7023): 'isRegistered' implicitly has return type 'any' be... Remove this comment to see the full error message
    async isRegistered(ctx: any) {
      const { appUri, podOwner } = ctx.params;
      // @ts-expect-error TS(2339): Property 'actions' does not exist on type '{ creat... Remove this comment to see the full error message
      return !!(await this.actions.getForApp({ appUri, podOwner }, { parentCtx: ctx }));
    }
  },
  hooks: {
    after: {
      async post(ctx: any, res: any) {
        const appUri = ctx.params.resource['interop:registeredAgent'];
        const webId = ctx.params.resource['interop:registeredBy'];

        // Keep in cache the Application resource. This is useful for:
        // - Display the application details in the app store even if it's offline
        // - Known when the app must be upgraded by comparing the dc:modified predicate
        await ctx.call('ldp.remote.store', { resourceUri: appUri, webId });
        await ctx.call('applications.attach', { resourceUri: appUri, webId });

        // Add the ApplicationRegistration to the AgentRegistry
        await ctx.call('agent-registry.add', {
          podOwner: webId,
          appRegistrationUri: res
        });

        return res;
      },
      async put(ctx: any, res: any) {
        // Update the Application resource kept in cache
        const appUri = ctx.params.resource['interop:registeredAgent'];
        const webId = ctx.params.resource['interop:registeredBy'];
        await ctx.call('ldp.remote.store', { resourceUri: appUri, webId });

        return res;
      },
      async delete(ctx: any, res: any) {
        const podOwner = res.oldData['interop:registeredBy'];
        const appUri = res.oldData['interop:registeredAgent'];

        // DELETE ALL RELATED AUTHORIZATIONS
        // The related grants will also be deleted as a side effect

        const accessAuthorizations = await ctx.call('access-authorizations.getForApp', { appUri, podOwner });

        for (const accessAuthorization of accessAuthorizations) {
          for (const dataAuthorizationUri of arrayOf(accessAuthorization['interop:hasDataAuthorization'])) {
            await ctx.call('data-authorizations.delete', {
              resourceUri: dataAuthorizationUri,
              webId: 'system'
            });
          }

          await ctx.call('access-authorizations.delete', {
            resourceUri: accessAuthorization.id || accessAuthorization['@id'],
            webId: 'system'
          });
        }

        // DELETE APPLICATION RESOURCE KEPT IN CACHE

        await ctx.call('applications.delete', {
          resourceUri: appUri
        });

        // REMOVE APPLICATION REGISTRATION FROM AGENT REGISTRY

        await ctx.call('agent-registry.remove', {
          podOwner,
          appRegistrationUri: res.resourceUri
        });

        return res;
      }
    }
  }
};
