const { MoleculerError } = require('moleculer').Errors;
const CONFIG = require('../../config/config');

const baseUrl = process.env.SEMAPPS_HOME_URL || CONFIG.BASE_URL || '';

module.exports = {
  name: 'oauth-protected-resource-metadata',

  settings: {
    resource: process.env.OAUTH_PROTECTED_RESOURCE_URL || baseUrl,
    authorizationServer: process.env.OAUTH_AUTHORIZATION_SERVER_URL || process.env.OAUTH_ISSUER || baseUrl
  },

  actions: {
    getMetadata: {
      async handler() {
        if (!this.settings.resource || !this.settings.authorizationServer) {
          throw new MoleculerError(
            'Protected resource metadata misconfigured',
            500,
            'OAUTH_METADATA_MISCONFIGURED'
          );
        }

        return {
          resource: this.settings.resource,
          authorization_servers: [this.settings.authorizationServer],
          bearer_methods_supported: ['header'],
          dpop_signing_alg_values_supported: ['ES256']
        };
      }
    }
  }
};
