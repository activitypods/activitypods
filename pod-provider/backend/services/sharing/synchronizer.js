const { SynchronizerService } = require('@semapps/sync');

module.exports = {
  mixins: [SynchronizerService],
  settings: {
    podProvider: true,
    mirrorGraph: false,
    synchronizeContainers: false,
    attachToLocalContainers: true
  }
};
