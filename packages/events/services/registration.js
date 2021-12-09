const { MoleculerError } = require('moleculer').Errors;
const { defaultToArray } = require('@semapps/ldp');
const { ActivitiesHandlerMixin } = require('@semapps/activitypub');
const { MIME_TYPES } = require("@semapps/mime-types");
const { JOIN_EVENT, LEAVE_EVENT } = require('../patterns');

module.exports = {
  name: 'events.registration',
  mixins: [ActivitiesHandlerMixin],
  dependencies: ['activitypub', 'ldp', 'notification', 'webacl'],
  activities: [
    {
      match: JOIN_EVENT,
      async onReceive(ctx, activity) {
        const event = activity.object;

        if( await ctx.call('events.status.isFinished', { event }) ) {
          throw new MoleculerError('Cet événement est terminé', 403, 'FORBIDDEN');
        } else if( await ctx.call('events.status.isClosed', { event }) ) {
          throw new MoleculerError('Les inscriptions pour cet événement sont fermées', 403, 'FORBIDDEN');
        }

        // TODO verify that user has been invited

        const participants = defaultToArray(event['pair:involves']) || [];
        await ctx.call(
          'ldp.resource.put',
          {
            resource: {
              ...event,
              'pair:involves': [ ...participants, activity.actor ]
            },
            contentType: MIME_TYPES.JSON,
            webId: 'system'
          }
        );

        await ctx.call('notification.joinOrLeave', {
          eventUri: event.id,
          userUri: activity.actor,
          joined: true
        });

        // TODO send confirmation mail to participant
      }
    },
    {
      match: LEAVE_EVENT,
      async onReceive(ctx, activity) {
        const event = activity.object;
        const participants = defaultToArray(event['pair:involves']) || [];

        if( !participants.includes(actorUri) ) {
          throw new MoleculerError('Vous ne participez pas à cet événement', 400);
        } else if( await ctx.call('events.status.isFinished', { event }) ) {
          throw new MoleculerError('Cet événement est terminé', 403, 'FORBIDDEN');
        }

        await ctx.call(
          'ldp.resource.put',
          {
            resource: {
              ...event,
              'pair:involves': participants.filter(uri => uri !== activity.actor)
            },
            contentType: MIME_TYPES.JSON,
            webId: 'system'
          }
        );

        await ctx.call('notification.joinOrLeave', {
          eventUri: event.id,
          userUri: activity.actor,
          joined: false
        });
      }
    }
  ]
};
