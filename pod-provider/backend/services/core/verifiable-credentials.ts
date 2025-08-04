import { VerifiableCredentialsService } from '@semapps/crypto';

const Schema = {
  mixins: [VerifiableCredentialsService],
  settings: {
    podProvider: true
  }
};

export default Schema;
