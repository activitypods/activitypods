import { VerifiableCredentialsService } from '@semapps/crypto';
import { ServiceSchema } from 'moleculer';

const Schema = {
  mixins: [VerifiableCredentialsService],
  settings: {
    podProvider: true
  }
} satisfies Partial<ServiceSchema>;

export default Schema;
