import { VerifiableCredentialsService } from '@semapps/crypto';
import { ServiceSchema } from 'moleculer';

const Schema = {
  // @ts-expect-error TS(2322): Type '{ name: "crypto.vc"; dependencies: string[];... Remove this comment to see the full error message
  mixins: [VerifiableCredentialsService],
  settings: {
    podProvider: true
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
