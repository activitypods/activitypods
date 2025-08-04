const { MoleculerError } = require('moleculer').Errors;
import { ActivitiesHandlerMixin, ACTIVITY_TYPES } from '@semapps/activitypub';
import { MIME_TYPES } from '@semapps/mime-types';
import { ServiceSchema } from 'moleculer';

const AppRegistrationSchema = {
  name: 'app.registration' as const,
  mixins: [ActivitiesHandlerMixin],
  activities: {
    createAppRegistration: {
      match: {
        type: ACTIVITY_TYPES.CREATE,
        object: {
          type: 'interop:ApplicationRegistration'
        }
      },
      async onReceive(ctx, activity) {
        if (activity.object['interop:registeredBy'] !== activity.actor)
          throw new Error(`The emitter is not the owner of the application registration`);

        // DELETE ANY EXISTING REGISTRATION (so that we don't get blocked)

        const filteredContainer = await ctx.call('app-registrations.list', {
          filters: {
            'http://www.w3.org/ns/solid/interop#registeredBy': activity.actor
          },
          accept: MIME_TYPES.JSON
        });

        if (filteredContainer['ldp:contains'].length > 0) {
          for (const appRegistration of filteredContainer['ldp:contains']) {
            await ctx.call('app-registrations.delete', {
              resourceUri: appRegistration.id || appRegistration['@id'],
              webId: 'system'
            });
          }
        }

        // CHECK ACCESS NEEDS ARE SATISFIED

        const { accessNeedsSatisfied, appRegistration, accessGrants } = await ctx.call('app-registrations.verify', {
          appRegistrationUri: activity.object.id
        });

        if (!accessNeedsSatisfied) {
          throw new MoleculerError('One or more required access needs have not been granted', 400, 'BAD REQUEST');
        }

        // STORE APP REGISTRATION AND GRANTS IN LOCAL CACHE

        await ctx.call('ldp.remote.store', { resource: appRegistration });
        await ctx.call('app-registrations.attach', { resourceUri: appRegistration.id || appRegistration['@id'] });

        for (const accessGrant of accessGrants) {
          await ctx.call('ldp.remote.store', { resource: accessGrant });
          await ctx.call('access-grants.attach', { resourceUri: accessGrant.id || accessGrant['@id'] });
        }

        // REGISTER LISTENERS

        await ctx.call('pod-activities-watcher.registerListenersFromAppRegistration', { appRegistration });
      }
    },
    updateAppRegistration: {
      match: {
        type: ACTIVITY_TYPES.UPDATE,
        object: {
          type: 'interop:ApplicationRegistration'
        }
      },
      async onReceive(ctx, activity) {
        // ENSURE A LOCAL APP REGISTRATION ALREADY EXIST

        try {
          await ctx.call('ldp.remote.getStored', { resourceUri: activity.object.id });
        } catch (e) {
          if (e.code === 404) {
            throw new MoleculerError(
              `No application registration found for this user. Create it first.`,
              400,
              'BAD REQUEST'
            );
          } else {
            console.error(e);
            throw e;
          }
        }

        // CHECK ACCESS NEEDS ARE STILL SATISFIED

        const { accessNeedsSatisfied, appRegistration, accessGrants } = await ctx.call('app-registrations.verify', {
          appRegistrationUri: activity.object.id
        });

        if (!accessNeedsSatisfied) {
          throw new MoleculerError('One or more required access needs have not been granted', 400, 'BAD REQUEST');
        }

        // UPDATE CACHE FOR APP REGISTRATION AND GRANTS

        await ctx.call('ldp.remote.store', { resource: appRegistration });

        for (const accessGrant of accessGrants) {
          // If the access grant is already cached, this will update the cache
          await ctx.call('ldp.remote.store', { resource: accessGrant });
          await ctx.call('access-grants.attach', { resourceUri: accessGrant.id || accessGrant['@id'] });
        }

        // Remove any grant that is not linked anymore to an access need
        await ctx.call('access-grants.deleteOrphans', { podOwner: activity.actor });

        await ctx.emit('app.upgraded', { appRegistration, accessGrants });
      }
    },
    deleteAppRegistration: {
      match: {
        type: ACTIVITY_TYPES.DELETE,
        object: {
          type: 'interop:ApplicationRegistration' // The matcher will fetch the local cache
        }
      },
      async onReceive(ctx, activity) {
        const appRegistration = activity.object;

        // This will also delete the associated access grants
        await ctx.call('app-registrations.delete', {
          resourceUri: appRegistration.id || appRegistration['@id'],
          webId: 'system'
        });
      }
    }
  }
} satisfies ServiceSchema;

export default AppRegistrationSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AppRegistrationSchema.name]: typeof AppRegistrationSchema;
    }
  }
}
