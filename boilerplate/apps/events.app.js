const urlJoin = require('url-join');
const { EventsApp } = require('@activitypods/events');
const CONFIG = require('../config');

module.exports = {
  mixins: [EventsApp],
  settings: {
    status: {
      // Event in the future or already finished ?
      coming: urlJoin(CONFIG.COMMON_DATA_URL, 'status', 'coming'),
      finished: urlJoin(CONFIG.COMMON_DATA_URL, 'status', 'finished'),
      // Subscriptions open or not ?
      open: urlJoin(CONFIG.COMMON_DATA_URL, 'status', 'open'),
      closed: urlJoin(CONFIG.COMMON_DATA_URL, 'status', 'closed'),
    }
  }
};