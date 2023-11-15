// Taken from https://github.com/CommunitySolidServer/CommunitySolidServer/blob/15a929a87e4ce00c0ed266e296405c8e4a22d4a7/config/identity/handler/base/provider-factory.json#L30
module.exports = {
  claims: {
    openid: ['azp'],
    webid: ['webid']
  },
  clockTolerance: 120,
  cookies: {
    long: { signed: true, maxAge: 86400000 },
    short: { signed: true }
  },
  enabledJWA: {
    dPoPSigningAlgValues: [
      'RS256',
      'RS384',
      'RS512',
      'PS256',
      'PS384',
      'PS512',
      'ES256',
      'ES256K',
      'ES384',
      'ES512',
      'EdDSA'
    ]
  },
  features: {
    claimsParameter: { enabled: true },
    clientCredentials: { enabled: true },
    devInteractions: { enabled: false },
    dPoP: { enabled: true },
    introspection: { enabled: true },
    registration: { enabled: true },
    revocation: { enabled: true },
    userinfo: { enabled: false }
  },
  scopes: ['openid', 'profile', 'offline_access', 'webid'],
  subjectTypes: ['public'],
  ttl: {
    AccessToken: 3600,
    AuthorizationCode: 600,
    BackchannelAuthenticationRequest: 600,
    ClientCredentials: 600,
    DeviceCode: 600,
    Grant: 1209600,
    IdToken: 3600,
    Interaction: 3600,
    RefreshToken: 86400,
    Session: 1209600
  }
};
