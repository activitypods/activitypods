const { PodActivitiesHandlerMixin } = require('@activitypods/app');

module.exports = {
  name: 'invite',
  mixins: [PodActivitiesHandlerMixin],
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
