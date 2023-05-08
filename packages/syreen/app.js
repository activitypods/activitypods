const GroupService = require('./services/group');
const OfferService = require('./services/offer');
const ProjectService = require('./services/project');

const SyreenApp = {
  name: 'syreen',
  settings: {
    groupUri: null,
  },
  dependencies: ['ldp.registry'],
  created() {
    if (!this.settings.groupUri) {
      throw new Error('No groupUri setting defined for Syreen app !')
    }

    this.broker.createService(GroupService, {
      settings: {
        groupUri: this.settings.groupUri
      }
    });

    this.broker.createService(OfferService);

    this.broker.createService(ProjectService);
  },
  async started() {
    await this.broker.call('ldp.registry.register', {
      path: '/syreen',
      permissions: {
        anon: {
          read: true
        }
      },
    });
  },
};

module.exports = SyreenApp;
