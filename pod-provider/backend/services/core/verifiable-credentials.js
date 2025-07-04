const { VerifiableCredentialsService } = require('@semapps/crypto');

module.exports = {
  mixins: [VerifiableCredentialsService],
  settings: {
    podProvider: true
  }
};
