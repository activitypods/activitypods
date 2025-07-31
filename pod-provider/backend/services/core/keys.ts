import path from 'path';
// @ts-expect-error TS(7016): Could not find a declaration file for module '@sem... Remove this comment to see the full error message
import { KeysService } from '@semapps/crypto';
import { ServiceSchema } from 'moleculer';

const ServiceSchema = {
  mixins: [KeysService],

  settings: {
    podProvider: true
  }
} satisfies ServiceSchema;

export default ServiceSchema;
