const { MoleculerError } = require('moleculer').Errors;
const CONFIG = require('../../config/config');

const baseUrl = process.env.SEMAPPS_HOME_URL || CONFIG.BASE_URL || '';
const normalizedBaseUrl = String(baseUrl).replace(/\/+$/, '');

function joinUrl(base, path) {
  const cleanBase = String(base || '').replace(/\/+$/, '');
  const cleanPath = String(path || '').startsWith('/') ? String(path) : `/${String(path || '')}`;
  return cleanBase ? `${cleanBase}${cleanPath}` : '';
}

module.exports = {
  name: 'oauth-authorization-server-metadata',

  settings: {
    issuer: process.env.OAUTH_ISSUER || normalizedBaseUrl,
    authorizationEndpoint: process.env.OAUTH_AUTHORIZATION_ENDPOINT || joinUrl(normalizedBaseUrl, '/oauth/authorize'),
    tokenEndpoint: process.env.OAUTH_TOKEN_ENDPOINT || joinUrl(normalizedBaseUrl, '/oauth/token'),
    parEndpoint: process.env.OAUTH_PAR_ENDPOINT || joinUrl(normalizedBaseUrl, '/oauth/par'),
    revocationEndpoint: process.env.OAUTH_REVOCATION_ENDPOINT || '',
    dpopNonceEndpoint: process.env.OAUTH_DPOP_NONCE_ENDPOINT || joinUrl(normalizedBaseUrl, '/oauth/dpop-nonce'),
    scopesSupported: String(process.env.OAUTH_SCOPES_SUPPORTED || 'atproto').split(',').map(v => v.trim()).filter(Boolean)
  },

  actions: {
    getMetadata: {
      async handler() {
        const required = [
          ['OAUTH_ISSUER', this.settings.issuer],
          ['OAUTH_AUTHORIZATION_ENDPOINT', this.settings.authorizationEndpoint],
          ['OAUTH_TOKEN_ENDPOINT', this.settings.tokenEndpoint],
          ['OAUTH_PAR_ENDPOINT', this.settings.parEndpoint],
          ['OAUTH_DPOP_NONCE_ENDPOINT', this.settings.dpopNonceEndpoint]
        ];

        const missing = required.filter(([, value]) => !value).map(([key]) => key);
        if (missing.length > 0) {
          throw new MoleculerError(
            `OAuth metadata misconfigured: missing ${missing.join(', ')}`,
            500,
            'OAUTH_METADATA_MISCONFIGURED'
          );
        }

        return {
          issuer: this.settings.issuer,
          authorization_endpoint: this.settings.authorizationEndpoint,
          token_endpoint: this.settings.tokenEndpoint,
          pushed_authorization_request_endpoint: this.settings.parEndpoint,
          revocation_endpoint: this.settings.revocationEndpoint || undefined,
          dpop_nonce_endpoint: this.settings.dpopNonceEndpoint,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
          token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
          dpop_signing_alg_values_supported: ['ES256'],
          scopes_supported: this.settings.scopesSupported,
          client_id_metadata_document_supported: true
        };
      }
    }
  }
};
