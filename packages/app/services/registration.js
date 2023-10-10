const { ActivitiesHandlerMixin, ACTIVITY_TYPES } = require('@semapps/activitypub');
const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { interopContext } = require('@semapps/core');

module.exports = {
  name: 'app.installation',
  mixins: [ActivitiesHandlerMixin],
  created() {
    this.broker.createService({
      name: 'application-registrations',
      mixins: [ControlledContainerMixin],
      settings: {
        path: '/application-registrations',
        acceptedTypes: ['interop:ApplicationRegistration'],
        newResourcesPermissions: {}
      }
    });

    this.broker.createService({
      name: 'access-grants',
      mixins: [ControlledContainerMixin],
      settings: {
        path: '/access-grants',
        acceptedTypes: ['interop:AccessGrant'],
        newResourcesPermissions: {}
      }
    });

    this.broker.createService({
      name: 'data-grants',
      mixins: [ControlledContainerMixin],
      settings: {
        path: '/data-grants',
        acceptedTypes: ['interop:DataGrant'],
        newResourcesPermissions: {}
      }
    });
  },
  activities: {
    createAppRegistration: {
      match: {
        type: 'Create',
        object: {
          type: 'interop:ApplicationRegistration'
        }
      },
      async onReceive(ctx, activity, recipientUri) {
        console.log('Received app registration', activity);

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

        const dataGrantsUris = accessGrants.reduce((acc, cur) => acc.push(cur['interop:hasAccessNeed']), []);
        const specialRightsUris = accessGrants.reduce((acc, cur) => acc.push(cur['apods:hasSpecialRights']), []);

        const dataGrants = await Promise.all(
          dataGrantsUris.map(dataGrantUri =>
            ctx.call('ldp.remote.get', {
              resourceUri: dataGrantUri,
              jsonContext: interopContext,
              accept: MIME_TYPES.JSON
            })
          )
        );

        // ENSURE NO REGISTRATION ALREADY EXIST FOR THIS USER

        // CHECK THAT GRANTS MATCH WITH ACCESS NEEDS

        const filteredContainer = await ctx.call('access-needs-groups.list', {
          filter: { 'interop:accessNecessity': 'interop:AccessRequired' },
          accept: MIME_TYPES.JSON
        });

        const requiredAccessNeedGroup = filteredContainer['ldp:contains'];

        // Return true if all access needs and special rights of the required AccessNeedGroup are granted
        const accessNeedsSatisfied = requiredAccessNeedGroup.every(
          group =>
            arrayOf(group['interop:hasAccessNeed']).every(accessNeedUri =>
              dataGrants.some(dataGrant => dataGrant['interop:satisfiesAccessNeed'] === accessNeedUri)
            ) &&
            arrayOf(group['interop:hasSpecialRights']).every(specialRightUri =>
              specialRightsUris.some(sr => sr === specialRightUri)
            )
        );

        // SEND BACK RESULT

        const outboxUri = await ctx.call('activitypub.actor.getCollectionUri', {
          actorUri: recipientUri,
          predicate: 'outbox'
        });

        if (!accessNeedsSatisfied) {
          await ctx.call('activitypub.outbox.post', {
            collectionUri: outboxUri,
            type: ACTIVITY_TYPES.REJECT,
            object: activity.id,
            to: activity.actor
          });
        } else {
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
        }
      }
    }
  }
};
