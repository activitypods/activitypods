const { PodCollectionsHandlerMixin } = require('@activitypods/app');

module.exports = {
  name: 'attendees',
  mixins: [PodCollectionsHandlerMixin],
  settings: {
    type: 'Event',
    attachPredicate: 'http://activitypods.org/ns/core#attendees',
    collectionOptions: {
      ordered: false,
      summary: 'Event attendees'
    },
    createWacGroup: true
  }
};
