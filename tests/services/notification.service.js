const { SingleMailNotificationsService } = require('@semapps/notifications');
const CONFIG = require("../config");

module.exports = {
  mixins: [SingleMailNotificationsService],
  settings: {
    defaultFrontUrl: 'https://test.com/',
    from: `${CONFIG.FROM_NAME} <${CONFIG.FROM_EMAIL}>`,
    transport: {
      host: CONFIG.SMTP_HOST,
      port: CONFIG.SMTP_PORT,
      secure: CONFIG.SMTP_SECURE,
      auth: {
        user: CONFIG.SMTP_USER,
        pass: CONFIG.SMTP_PASS,
      },
    }
  }
};
