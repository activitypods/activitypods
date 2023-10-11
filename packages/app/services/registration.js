const { ActivitiesHandlerMixin, ACTIVITY_TYPES } = require('@semapps/activitypub');
const { arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { interopContext } = require('@semapps/core');

module.exports = {
  name: 'app.installation',
  mixins: [ActivitiesHandlerMixin],
  activities: {
    createAppRegistration: {
      match: {
        type: 'Create',
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

          let filteredContainer = await ctx.call('app-registrations.list', {
            filters: {
              'http://www.w3.org/ns/solid/interop#registeredBy': activity.actor
            },
            accept: MIME_TYPES.JSON
          });

          if (filteredContainer.length > 0) {
            throw new Error(`User ${recipientUri} already has an application registration. Update or delete it.`);
          }

          // GET APP REGISTRATION AND GRANTS

          const appRegistration = await ctx.call('ldp.remote.get', {
            resourceUri: activity.object.id,
            jsonContext: interopContext
          });

          const accessGrants = await Promise.all(
            appRegistration['interop:hasAccessGrant'].map(accessGrantUri =>
              ctx.call('ldp.remote.get', {
                resourceUri: accessGrantUri,
                jsonContext: interopContext,
                accept: MIME_TYPES.JSON
              })
            )
          );

          const dataGrantsUris = accessGrants.reduce(
            (acc, cur) => (cur['interop:hasDataGrant'] ? [...acc, cur['interop:hasDataGrant']] : acc),
            []
          );
          const specialRightsUris = accessGrants.reduce(
            (acc, cur) => (cur['apods:hasSpecialRights'] ? [...acc, cur['apods:hasSpecialRights']] : acc),
            []
          );

          const dataGrants = await Promise.all(
            dataGrantsUris.map(dataGrantUri =>
              ctx.call('ldp.remote.get', {
                resourceUri: dataGrantUri,
                jsonContext: interopContext,
                accept: MIME_TYPES.JSON
              })
            )
          );

          // CHECK THAT GRANTS MATCH WITH ACCESS NEEDS

          filteredContainer = await ctx.call('access-needs-groups.list', {
            filters: {
              'http://www.w3.org/ns/solid/interop#accessNecessity': 'http://www.w3.org/ns/solid/interop#AccessRequired'
            },
            accept: MIME_TYPES.JSON
          });

          const requiredAccessNeedGroups = arrayOf(filteredContainer['ldp:contains']);

          // Return true if all access needs and special rights of the required AccessNeedGroups are granted
          const accessNeedsSatisfied = requiredAccessNeedGroups.every(
            group =>
              arrayOf(group['interop:hasAccessNeed']).every(accessNeedUri =>
                dataGrants.some(dataGrant => dataGrant['interop:satisfiesAccessNeed'] === accessNeedUri)
              ) &&
              arrayOf(group['interop:hasSpecialRights']).every(specialRightUri =>
                specialRightsUris.some(sr => sr === specialRightUri)
              )
          );

          if (!accessNeedsSatisfied) {
            throw new Error('One or more required access needs have not been granted');
          }

          // SEND BACK RESULT
          await ctx.call('activitypub.outbox.post', {
            collectionUri: outboxUri,
            type: ACTIVITY_TYPES.ACCEPT,
            object: activity.id,
            to: activity.actor
          });

          // STORE LOCALLY APP REGISTRATION AND GRANTS

          await ctx.call('ldp.remote.store', { resource: appRegistration });

          for (const accessGrant of accessGrants) {
            await ctx.call('ldp.remote.store', { resource: accessGrant });
          }

          for (const dataGrant of dataGrants) {
            await ctx.call('ldp.remote.store', { resource: dataGrant });
          }
        } catch (e) {
          await ctx.call('activitypub.outbox.post', {
            collectionUri: outboxUri,
            type: ACTIVITY_TYPES.REJECT,
            summary: e.message,
            object: activity.id,
            to: activity.actor
          });
        }
      }
    }
  }
};
