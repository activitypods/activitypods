const { MoleculerError } = require('moleculer').Errors;
const { ActivitiesHandlerMixin, ACTIVITY_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');

module.exports = {
  name: 'registration',
  mixins: [ActivitiesHandlerMixin],
  activities: {
    createAppRegistration: {
      match: {
        type: ACTIVITY_TYPES.CREATE,
        object: {
          type: 'interop:ApplicationRegistration'
        }
      },
      async onReceive(ctx, activity, recipientUri) {
        const outboxUri = await ctx.call('activitypub.actor.getCollectionUri', {
          actorUri: recipientUri,
          predicate: 'outbox'
        });

        try {
          // ENSURE THE APP IS NOT ALREADY REGISTERED

          const filteredContainer = await ctx.call('app-registrations.list', {
            filters: {
              'http://www.w3.org/ns/solid/interop#registeredBy': activity.actor
            },
            accept: MIME_TYPES.JSON
          });

          if (filteredContainer['ldp:contains'].length > 0) {
            throw new MoleculerError(
              `User already has an application registration. Update or delete it.`,
              400,
              'BAD REQUEST'
            );
          }

          // CHECK ACCESS NEEDS ARE SATISFIED

          const { accessNeedsSatisfied, appRegistration, accessGrants, dataGrants } = await ctx.call(
            'app-registrations.verify',
            { appRegistrationUri: activity.object.id }
          );

          if (!accessNeedsSatisfied) {
            throw new MoleculerError('One or more required access needs have not been granted', 400, 'BAD REQUEST');
          }

          // SEND BACK ACCEPT ACTIVITY

          await ctx.call('activitypub.outbox.post', {
            collectionUri: outboxUri,
            type: ACTIVITY_TYPES.ACCEPT,
            object: activity.id,
            to: activity.actor
          });

          // STORE APP REGISTRATION AND GRANTS IN LOCAL CACHE

          await ctx.call('ldp.remote.store', { resource: appRegistration });
          await ctx.call('app-registrations.attach', { resourceUri: appRegistration.id || appRegistration['@id'] });

          for (const accessGrant of accessGrants) {
            await ctx.call('ldp.remote.store', { resource: accessGrant });
            await ctx.call('access-grants.attach', { resourceUri: accessGrant.id || accessGrant['@id'] });
          }

          for (const dataGrant of dataGrants) {
            await ctx.call('ldp.remote.store', { resource: dataGrant });
            await ctx.call('data-grants.attach', { resourceUri: dataGrant.id || dataGrant['@id'] });
          }

          await ctx.emit('app.registered', { appRegistration, accessGrants, dataGrants });
        } catch (e) {
          if (e.code !== 400) console.error(e);
          await ctx.call('activitypub.outbox.post', {
            collectionUri: outboxUri,
            type: ACTIVITY_TYPES.REJECT,
            summary: e.message,
            object: activity.id,
            to: activity.actor
          });
        }
      }
    },
    updateAppRegistration: {
      match: {
        type: ACTIVITY_TYPES.UPDATE,
        object: {
          type: 'interop:ApplicationRegistration'
        }
      },
      async onReceive(ctx, activity, recipientUri) {
        const outboxUri = await ctx.call('activitypub.actor.getCollectionUri', {
          actorUri: recipientUri,
          predicate: 'outbox'
        });

        try {
          // ENSURE A LOCAL APP REGISTRATION ALREADY EXIST

          const localAppRegistration = await ctx.call('ldp.remote.getStored', { resourceUri: activity.object.id });

          if (!localAppRegistration) {
            throw new MoleculerError(
              `No application registration found for this user. Create it first.`,
              400,
              'BAD REQUEST'
            );
          }

          // CHECK ACCESS NEEDS ARE STILL SATISFIED

          const { accessNeedsSatisfied, appRegistration, accessGrants, dataGrants } = await ctx.call(
            'app-registrations.verify',
            { appRegistrationUri: activity.object.id }
          );

          if (!accessNeedsSatisfied) {
            throw new MoleculerError('One or more required access needs have not been granted', 400, 'BAD REQUEST');
          }

          // SEND BACK ACCEPT ACTIVITY

          await ctx.call('activitypub.outbox.post', {
            collectionUri: outboxUri,
            type: ACTIVITY_TYPES.ACCEPT,
            object: activity.id,
            to: activity.actor
          });

          // UPDATE CACHE FOR APP REGISTRATION AND GRANTS

          await ctx.call('ldp.remote.store', { resource: appRegistration });

          for (const accessGrant of accessGrants) {
            // If the access grant is already cached, this will update the cache
            await ctx.call('ldp.remote.store', { resource: accessGrant });
            await ctx.call('access-grants.attach', { resourceUri: accessGrant.id || accessGrant['@id'] });
          }

          for (const dataGrant of dataGrants) {
            // If the data grant is already cached, this will update the cache
            await ctx.call('ldp.remote.store', { resource: dataGrant });
            await ctx.call('data-grants.attach', { resourceUri: dataGrant.id || dataGrant['@id'] });
          }

          // Remove any grant that is not linked anymore to an access need
          await ctx.call('access-grants.deleteOrphans', { podOwner: activity.actor });
          await ctx.call('data-grants.deleteOrphans', { podOwner: activity.actor });

          await ctx.emit('app.upgraded', { appRegistration, accessGrants, dataGrants });
        } catch (e) {
          if (e.code !== 400) console.error(e);
          await ctx.call('activitypub.outbox.post', {
            collectionUri: outboxUri,
            type: ACTIVITY_TYPES.REJECT,
            summary: e.message,
            object: activity.id,
            to: activity.actor
          });
        }
      }
    },
    deleteAppRegistration: {
      match: {
        type: ACTIVITY_TYPES.DELETE,
        object: {
          type: 'interop:ApplicationRegistration'
        }
      },
      async onReceive(ctx, activity, recipientUri) {
        const appRegistration = await ctx.call('app-registrations.getForActor', { actorUri: activity.actor });

        // This will also delete the associated access grants and data grants
        await ctx.call('app-registrations.delete', {
          resourceUri: appRegistration.id || appRegistration['@id'],
          webId: 'system'
        });

        // SEND BACK ACCEPT ACTIVITY

        const outboxUri = await ctx.call('activitypub.actor.getCollectionUri', {
          actorUri: recipientUri,
          predicate: 'outbox'
        });

        await ctx.call('activitypub.outbox.post', {
          collectionUri: outboxUri,
          type: ACTIVITY_TYPES.ACCEPT,
          object: activity.id,
          to: activity.actor
        });
      }
    }
  }
};
