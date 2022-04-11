const { SingleMailNotificationsService } = require('@semapps/notifications');

module.exports = {
  mixins: [SingleMailNotificationsService],
  settings: {
    defaultFrontUrl: 'https://test.com/',
    transport: {}
  }
};
