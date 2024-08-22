const urlJoin = require('url-join');
const { MoleculerError } = require('moleculer').Errors;
const { ActivitiesHandlerMixin, ACTIVITY_TYPES } = require('@semapps/activitypub');
const ApplicationsService = require('./sub-services/applications');
const AppRegistrationsService = require('./sub-services/app-registrations');
const AccessGrantsService = require('./sub-services/access-grants');
const DataGrantsService = require('./sub-services/data-grants');

module.exports = {
  name: 'installation',
  mixins: [ActivitiesHandlerMixin],
  created() {
    this.broker.createService(ApplicationsService);
    this.broker.createService(AppRegistrationsService);
    this.broker.createService(AccessGrantsService);
    this.broker.createService(DataGrantsService);
  },
  activities: {
    install: {
      match: {
        type: 'apods:Install'
      },
      async onEmit(ctx, activity, emitterUri) {
        const appRegistration = await ctx.call('app-registrations.getForApp', {
          appUri: activity.object,
          podOwner: emitterUri
        });

        if (appRegistration) {
          throw new MoleculerError(
            `User already has an application registration. Upgrade or uninstall the app first.`,
            400,
            'BAD REQUEST'
          );
        }

        const appRegistrationUri = await ctx.call('app-registrations.createOrUpdate', {
          appUri: activity.object,
          podOwner: emitterUri,
          acceptedAccessNeeds: activity['apods:acceptedAccessNeeds'],
          acceptedSpecialRights: activity['apods:acceptedSpecialRights']
        });

        await ctx.call('activitypub.outbox.post', {
          collectionUri: urlJoin(emitterUri, 'outbox'),
          '@type': ACTIVITY_TYPES.CREATE,
          object: appRegistrationUri,
          to: activity.object
        });
      }
    },
    upgrade: {
      match: {
        type: 'apods:Upgrade'
      },
      async onEmit(ctx, activity, emitterUri) {
        const appRegistrationUri = await ctx.call('app-registrations.createOrUpdate', {
          appUri: activity.object,
          podOwner: emitterUri,
          acceptedAccessNeeds: activity['apods:acceptedAccessNeeds'],
          acceptedSpecialRights: activity['apods:acceptedSpecialRights']
        });

        await ctx.call('activitypub.outbox.post', {
          collectionUri: urlJoin(emitterUri, 'outbox'),
          '@type': ACTIVITY_TYPES.UPDATE,
          object: appRegistrationUri,
          to: activity.object
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

        const appRegistration = await ctx.call('app-registrations.get', {
          resourceUri: appRegistrationUri,
          webId: recipientUri
        });

        // SECURITY CHECKS

        if (appRegistration['interop:registeredBy'] !== recipientUri) {
          throw new Error(`The ApplicationRegistration ${appRegistrationUri} is not owned by ${recipientUri}`);
        }

        if (appRegistration['interop:registeredAgent'] !== activity.actor) {
          throw new Error(`The ApplicationRegistration ${appRegistrationUri} is not for actor ${activity.actor}`);
        }

        // DELETE APPLICATION REGISTRATION (THIS WILL ALSO DELETE ALL ASSOCIATED GRANTS)

        await ctx.call('app-registrations.delete', {
          resourceUri: appRegistrationUri,
          webId: recipientUri
        });
      }
    },
    uninstall: {
      match: {
        type: ACTIVITY_TYPES.UNDO,
        object: {
          type: 'apods:Install'
        }
      },
      async onEmit(ctx, activity, emitterUri) {
        const appUri = activity.object.object;
        const podOwner = emitterUri;

        const appRegistration = await ctx.call('app-registrations.getForApp', { appUri, podOwner });

        if (appRegistration) {
          // Immediately delete existing webhooks channels to avoid permissions errors later
          await ctx.call('solid-notifications.provider.webhook.deleteAppChannels', { appUri, webId: emitterUri });

          // Delete registration locally (through activitypub.object.process) and warn the app to delete its cache
          await ctx.call('activitypub.outbox.post', {
            collectionUri: urlJoin(emitterUri, 'outbox'),
            type: ACTIVITY_TYPES.DELETE,
            object: appRegistration.id || appRegistration['@id'],
            to: appUri
          });
        }
      }
    }
  }
};
