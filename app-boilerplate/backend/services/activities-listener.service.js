const { ActivitiesListenerMixin } = require('@activitypods/solid-notifications');

module.exports = {
  mixins: [ActivitiesListenerMixin],
  activities: {
    invite: {
      match: {
        type: 'Invite',
        object: {
          type: 'Event'
        }
      },
      async onEmit(ctx, activity, actorUri) {
        console.log('Detected event invitation !', activity);
      }
    }
  }
};
