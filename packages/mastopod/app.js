const FollowService = require('./services/follow');

const MastopodApp = {
  name: 'mastopod',
  created() {
    this.broker.createService(FollowService);
  }
};

module.exports = MastopodApp;
