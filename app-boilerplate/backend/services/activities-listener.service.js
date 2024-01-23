const QueueMixin = require('moleculer-bull');
const { ActivitiesListenerMixin } = require('@activitypods/solid-notifications');
const CONFIG = require('../config/config');

module.exports = {
  mixins: [ActivitiesListenerMixin, QueueMixin(CONFIG.QUEUE_SERVICE_URL)],
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
