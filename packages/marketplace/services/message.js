const { NEW_MESSAGE_ABOUT_OFFER_OR_REQUEST } = require('../config/patterns');
const { NEW_MESSAGE_ABOUT_OFFER_OR_REQUEST_MAPPING } = require('../config/mappings');

module.exports = {
  name: 'marketplace.message',
  dependencies: ['activity-mapping'],
  async started() {
    await this.broker.call('activity-mapping.addMapper', {
      match: NEW_MESSAGE_ABOUT_OFFER_OR_REQUEST,
      mapping: NEW_MESSAGE_ABOUT_OFFER_OR_REQUEST_MAPPING,
      priority: 2 // Before regular new messages
    });
  }
};
