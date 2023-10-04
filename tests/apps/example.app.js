const { AppService } = require('@activitypods/app');
const { AS_PREFIX } = require('@semapps/activitypub');

module.exports = {
  mixins: [AppService],
  settings: {
    name: 'Example App',
    description: 'An ActivityPods app for integration tests',
    accessNeeds: {
      required: [
        {
          registeredClass: AS_PREFIX + 'Event',
          accessMode: ['acl:Read', 'acl:Create']
        },
        'apods:ReadInbox'
      ],
      optional: [
        {
          registeredClass: AS_PREFIX + 'Location',
          accessMode: ['acl:Read', 'acl:Create']
        },
        'apods:SendNotification'
      ]
    }
  }
};
