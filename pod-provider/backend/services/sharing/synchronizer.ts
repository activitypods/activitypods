// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { SynchronizerService } from '@semapps/sync';
import { ServiceSchema } from 'moleculer';

const ServiceSchema = {
  mixins: [SynchronizerService],

  settings: {
    podProvider: true,
    mirrorGraph: false,
    synchronizeContainers: false,
    attachToLocalContainers: true
  }
} satisfies ServiceSchema;

export default ServiceSchema;
