const { NEW_MESSAGE_ABOUT_EVENT } = require('../config/patterns');
const { NEW_MESSAGE_ABOUT_EVENT_MAPPING } = require('../config/mappings');

module.exports = {
  name: 'events.message',
  async started() {
    await this.broker.call('activitypub.activity-mapping.addMapper', {
      match: NEW_MESSAGE_ABOUT_EVENT,
      mapping: NEW_MESSAGE_ABOUT_EVENT_MAPPING,
      priority: 2 // Before regular new messages
    });
  }
};
