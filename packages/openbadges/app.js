const BadgeService = require('./services/badge');

const OpenBadgesApp = {
  name: 'openbadges',
  created() {
    this.broker.createService(BadgeService);
  },
};

module.exports = OpenBadgesApp;
