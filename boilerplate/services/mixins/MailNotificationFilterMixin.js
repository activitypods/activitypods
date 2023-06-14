const { OBJECT_TYPES } = require('@semapps/activitypub');

module.exports = {
  dependencies: ['activitypub.actor', 'activitypub.collection'],
  methods: {
    /** Return true, if notification should pass. */
    async filterNotification(notification, activity, recipientUri) {
      // We don't filter direct message notifications (i.e. from notes).
      if (activity.type === OBJECT_TYPES.NOTE) {
        return true;
      }
      const actor = await this.broker.call('activitypub.actor.get', { actorUri: recipientUri });

      const isIgnored = await this.broker.call('activitypub.collection.includes', {
        collectionUri: actor['apods:ignoredContacts'],
        itemUri: activity.actor,
      });
      if (isIgnored) {
        console.log('ignoring notification for', notification, activity);
      }
      return !isIgnored;
    },
  },
};
