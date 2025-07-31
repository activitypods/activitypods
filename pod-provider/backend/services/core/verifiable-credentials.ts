import { VerifiableCredentialsService } from '@semapps/crypto';
import { ServiceSchema } from 'moleculer';

const ServiceSchema = {
  mixins: [VerifiableCredentialsService],

  settings: {
    podProvider: true
  }
} satisfies ServiceSchema;

export default ServiceSchema;
