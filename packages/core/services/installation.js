const urlJoin = require('url-join');
const { ActivitiesHandlerMixin, ACTIVITY_TYPES } = require('@semapps/activitypub');
const { ControlledContainerMixin, arrayOf } = require('@semapps/ldp');
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

        for (const accessNeedGroupUri of arrayOf(app['interop:hasAccessNeedGroup'])) {
          const accessNeedGroup = await ctx.call('ldp.remote.get', { resourceUri: accessNeedGroupUri });
          let dataGrantsUris = [];
          let specialRightsUris = [];

          for (const accessNeedUri of arrayOf(accessNeedGroup['interop:hasAccessNeed'])) {
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

          for (const specialRightUri of arrayOf(accessNeedGroup['apods:hasSpecialRights'])) {
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
    },
    rejectAppRegistration: {
      match: {
        type: ACTIVITY_TYPES.REJECT,
        object: {
          type: ACTIVITY_TYPES.CREATE,
          object: {
            type: 'interop:ApplicationRegistration'
          }
        }
      },
      async onReceive(ctx, activity, recipientUri) {
        const appRegistrationUri = activity.object.object.id;

        const appRegistration = await ctx.call('ldp.resource.get', {
          resourceUri: appRegistrationUri,
          jsonContext: interopContext,
          accept: MIME_TYPES.JSON,
          webId: recipientUri
        });

        // SECURITY CHECKS

        if (appRegistration['interop:registeredBy'] !== recipientUri) {
          throw new Error(`The ApplicationRegistration ${appRegistrationUri} is not owned by ${recipientUri}`);
        }

        if (appRegistration['interop:registeredAgent'] !== activity.actor) {
          throw new Error(`The ApplicationRegistration ${appRegistrationUri} is not for actor ${activity.actor}`);
        }

        // DELETE ALL RELATED GRANTS

        for (const accessGrantUri of arrayOf(appRegistration['interop:hasAccessGrant'])) {
          const accessGrant = await ctx.call('ldp.resource.get', {
            resourceUri: accessGrantUri,
            jsonContext: interopContext,
            accept: MIME_TYPES.JSON,
            webId: recipientUri
          });

          for (const dataGrantUri of arrayOf(accessGrant['interop:hasDataGrant'])) {
            await ctx.call('ldp.resource.delete', {
              resourceUri: dataGrantUri,
              webId: recipientUri
            });
          }

          await ctx.call('ldp.resource.delete', {
            resourceUri: accessGrantUri,
            webId: recipientUri
          });
        }

        // DELETE APPLICATION REGISTRATION

        await ctx.call('ldp.resource.delete', {
          resourceUri: appRegistrationUri,
          webId: recipientUri
        });
      }
    }
  }
};
