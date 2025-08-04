import { SynchronizerService } from '@semapps/sync';

const Schema = {
  mixins: [SynchronizerService],
  settings: {
    podProvider: true,
    mirrorGraph: false,
    synchronizeContainers: false,
    attachToLocalContainers: true
  }
};

export default Schema;
