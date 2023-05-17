const { SyreenApp } = require('@activitypods/syreen');
const CONFIG = require('../config/config')

module.exports = {
  mixins: [SyreenApp],
  settings: {
    groupUri: CONFIG.SYREEN_GROUP_URI
  }
}