const { AppService } = require('@activitypods/app');
const { AS_PREFIX } = require('@semapps/activitypub');
const CONFIG = require('../config/config');

module.exports = {
  mixins: [AppService],
  settings: {
    baseUrl: CONFIG.HOME_URL,
    name: 'Example App',
    description: 'An ActivityPods-compatible app',
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
