import { SynchronizerService } from '@semapps/sync';
import { ServiceSchema } from 'moleculer';

const Schema = {
  mixins: [SynchronizerService],

  settings: {
    podProvider: true,
    mirrorGraph: false,
    synchronizeContainers: false,
    attachToLocalContainers: true
  }
} satisfies ServiceSchema;

export default ServiceSchema;
