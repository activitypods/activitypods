const SkillService = require('./services/skill');

const LaCarteDesSavoirsApp = {
  name: 'lacartedessavoirs',
  created() {
    this.broker.createService(SkillService);
  }
};

module.exports = LaCarteDesSavoirsApp;
