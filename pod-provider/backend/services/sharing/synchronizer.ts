import { SynchronizerService } from '@semapps/sync';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "synchronizer"; mixins: { dependenci... Remove this comment to see the full error message
  mixins: [SynchronizerService],
  settings: {
    podProvider: true,
    mirrorGraph: false,
    synchronizeContainers: false,
    attachToLocalContainers: true
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
