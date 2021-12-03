const { MoleculerError } = require('moleculer').Errors;
const { defaultToArray } = require('@semapps/ldp');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require("@semapps/mime-types");

module.exports = {
  name: 'events.registration',
  dependencies: ['activitypub', 'ldp', 'notification', 'webacl'],
  actions: {
    async join(ctx) {
      const { eventUri, actorUri } = ctx.params;
      const event = await ctx.call('activitypub.object.get', { objectUri: eventUri, actorUri });
      const participants = defaultToArray(event['pair:involves']) || [];

      if( await ctx.call('events.status.isFinished', { event }) ) {
        throw new MoleculerError('Cet événement est terminé', 403, 'FORBIDDEN');
      } else if( await ctx.call('events.status.isClosed', { event }) ) {
        throw new MoleculerError('Les inscriptions pour cet événement sont fermées', 403, 'FORBIDDEN');
      }

      // TODO verify that user has been invited

      await ctx.call(
        'ldp.resource.put',
        {
          resource: {
            ...event,
            'pair:involves': [ ...participants, actorUri ]
          },
          contentType: MIME_TYPES.JSON,
          webId: 'system'
        }
      );

      await ctx.call('notification.joinOrLeave', {
        eventUri,
        userUri: actorUri,
        joined: true
      });

      // TODO send confirmation mail to participant
    },
    async leave(ctx) {
      const { eventUri, actorUri } = ctx.params;
      const event = await ctx.call('activitypub.object.get', { objectUri: eventUri, actorUri });
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
            'pair:involves': participants.filter(uri => uri !== actorUri)
          },
          contentType: MIME_TYPES.JSON,
          webId: 'system'
        }
      );

      await ctx.call('notification.joinOrLeave', {
        eventUri,
        userUri: actorUri,
        joined: false
      });
    },
  },
  events: {
    async 'activitypub.inbox.received'(ctx) {
      const { activity } = ctx.params;

      switch(activity.type) {
        case ACTIVITY_TYPES.JOIN:
          await this.actions.join(
            {
              eventUri: typeof activity.object === 'string' ? activity.object : activity.object.id,
              actorUri: activity.actor
            },
            { parentCtx: ctx }
          );
          break;

        case ACTIVITY_TYPES.LEAVE:
          await this.actions.leave(
            {
              eventUri: typeof activity.object === 'string' ? activity.object : activity.object.id,
              actorUri: activity.actor
            },
            { parentCtx: ctx }
          );
          break;
      }
    }
  }
};
