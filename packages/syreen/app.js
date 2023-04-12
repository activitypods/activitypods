const OfferService = require('./services/offer');
const ProjectService = require('./services/project');

const SyreenApp = {
  name: 'syreen',
  dependencies: ['ldp.registry'],
  created() {
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
