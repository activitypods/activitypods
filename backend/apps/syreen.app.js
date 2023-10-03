const { SyreenApp } = require('@activitypods/syreen');
const CONFIG = require('../config/config');

module.exports = {
  mixins: [SyreenApp],
  settings: {
    groupUri: CONFIG.SYREEN_GROUP_URI,
    alertBotUri: CONFIG.SYREEN_ALERT_BOT_URI
  }
};
