const { VerifiableCredentialsService } = require('@semapps/crypto');

module.exports = {
  mixins: [VerifiableCredentialsService],
  podProvider: true
};
