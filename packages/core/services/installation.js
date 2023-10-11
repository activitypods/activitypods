const urlJoin = require('url-join');
const { ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { ControlledContainerMixin, defaultToArray } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const interopContext = require('../config/context-interop.json');

module.exports = {
  name: 'installation',
  mixins: [ActivitiesHandlerMixin],
  created() {
    this.broker.createService({
      name: 'application-registrations',
      mixins: [ControlledContainerMixin],
      settings: {
        path: '/application-registrations',
        acceptedTypes: ['interop:ApplicationRegistration'],
        newResourcesPermissions: {
          anon: {
            read: true
          }
        }
      }
    });

    this.broker.createService({
      name: 'access-grants',
      mixins: [ControlledContainerMixin],
      settings: {
        path: '/access-grants',
        acceptedTypes: ['interop:AccessGrant'],
        newResourcesPermissions: {
          anon: {
            read: true
          }
        }
      }
    });

    this.broker.createService({
      name: 'data-grants',
      mixins: [ControlledContainerMixin],
      settings: {
        path: '/data-grants',
        acceptedTypes: ['interop:DataGrant'],
        newResourcesPermissions: {
          anon: {
            read: true
          }
        }
      }
    });
  },
  activities: {
    install: {
      match: {
        type: 'apods:Install'
      },
      async onEmit(ctx, activity, emitterUri) {
        const appUri = activity.object;
        let accessGrantsUris = [];

        const app = await ctx.call('ldp.remote.get', { resourceUri: appUri });

        for (const accessNeedGroupUri of defaultToArray(app['interop:hasAccessNeedGroup'] || [])) {
          const accessNeedGroup = await ctx.call('ldp.remote.get', { resourceUri: accessNeedGroupUri });
          let dataGrantsUris = [];
          let specialRightsUris = [];

          for (const accessNeedUri of defaultToArray(accessNeedGroup['interop:hasAccessNeed']) || []) {
            if (activity['apods:acceptedAccessNeeds'].includes(accessNeedUri)) {
              const accessNeed = await ctx.call('ldp.remote.get', { resourceUri: accessNeedUri });
              dataGrantsUris.push(
                await ctx.call('data-grants.post', {
                  resource: {
                    '@context': ['https://www.w3.org/ns/activitystreams', interopContext],
                    '@type': 'interop:DataGrant',
                    'interop:dataOwner': emitterUri,
                    'interop:grantee': appUri,
                    'apods:registeredClass': accessNeed['apods:registeredClass'],
                    'interop:accessMode': accessNeed['interop:accessMode'],
                    'interop:scopeOfGrant': 'interop:All',
                    'interop:satisfiesAccessNeed': accessNeedUri
                  },
                  contentType: MIME_TYPES.JSON
                })
              );
            }
          }

          for (const specialRightUri of defaultToArray(accessNeedGroup['apods:hasSpecialRights']) || []) {
            if (activity['apods:acceptedSpecialRights'].includes(specialRightUri)) {
              specialRightsUris.push(specialRightUri);
            }
          }

          accessGrantsUris.push(
            await ctx.call('access-grants.post', {
              resource: {
                '@context': ['https://www.w3.org/ns/activitystreams', interopContext],
                '@type': 'interop:AccessGrant',
                'interop:grantedBy': emitterUri,
                'interop:grantedAt': new Date().toISOString(),
                'interop:grantee': appUri,
                'interop:hasAccessNeedGroup': accessNeedGroupUri,
                'interop:hasDataGrant': dataGrantsUris,
                'apods:hasSpecialRights': specialRightsUris
              },
              contentType: MIME_TYPES.JSON
            })
          );
        }

        const appRegistrationUri = await ctx.call('application-registrations.post', {
          resource: {
            '@context': ['https://www.w3.org/ns/activitystreams', interopContext],
            '@type': 'interop:ApplicationRegistration',
            'interop:registeredBy': emitterUri,
            'interop:registeredAt': new Date().toISOString(),
            'interop:updatedAt': new Date().toISOString(),
            'interop:registeredAgent': appUri,
            'interop:hasAccessGrant': accessGrantsUris
          },
          contentType: MIME_TYPES.JSON
        });

        await ctx.call('activitypub.outbox.post', {
          collectionUri: urlJoin(emitterUri, 'outbox'),
          '@context': ['https://www.w3.org/ns/activitystreams', interopContext],
          '@type': 'Create',
          object: appRegistrationUri,
          to: appUri
        });
      }
    }
  }
};
