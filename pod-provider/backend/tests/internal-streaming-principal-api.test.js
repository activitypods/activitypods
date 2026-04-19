const crypto = require('crypto');
const serviceDefinition = require('../services/internal-streaming-principal-api.service');

function createService(overrides = {}) {
  return {
    settings: {
      auth: {
        bearerToken: 'internal-token',
        oauthSessionCookieName: 'oauth_session',
        oauthSessionSecret: 'oauth-secret',
        cookieResolverAction: '',
        tokenCookieNames: ['access_token', 'token', 'jwt', 'id_token']
      }
    },
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    },
    ...serviceDefinition.methods,
    ...overrides
  };
}

function buildOauthSessionCookie(service, webId) {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = Buffer.from(JSON.stringify({ webId, exp }), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', service.settings.auth.oauthSessionSecret)
    .update(payload, 'utf8')
    .digest('base64url');
  return `oauth_session=${encodeURIComponent(`${payload}.${sig}`)}`;
}

describe('internal-streaming-principal-api', () => {
  test('resolves principal from a forwarded bearer token', async () => {
    const service = createService();
    const ctx = {
      params: {
        authorization: 'Bearer user-token'
      },
      meta: {},
      call: jest.fn().mockResolvedValue({ webId: 'https://example.com/users/alice' })
    };

    const result = await serviceDefinition.actions.resolvePrincipal.call(service, ctx);

    expect(result).toEqual({
      principal: 'https://example.com/users/alice',
      auth_type: 'bearer'
    });
    expect(ctx.call).toHaveBeenCalledWith('auth.jwt.decodeToken', { token: 'user-token' });
  });

  test('resolves principal from the oauth session cookie', async () => {
    const service = createService();
    const ctx = {
      params: {
        cookie: buildOauthSessionCookie(service, 'https://example.com/users/alice')
      },
      meta: {},
      call: jest.fn()
    };

    const result = await serviceDefinition.actions.resolvePrincipal.call(service, ctx);

    expect(result).toEqual({
      principal: 'https://example.com/users/alice',
      auth_type: 'cookie'
    });
    expect(ctx.call).not.toHaveBeenCalled();
  });

  test('rejects when no forwarded auth context can be resolved', async () => {
    const service = createService();
    const ctx = {
      params: {},
      meta: {},
      call: jest.fn()
    };

    await expect(
      serviceDefinition.actions.resolvePrincipal.call(service, ctx)
    ).rejects.toMatchObject({
      code: 401,
      type: 'LOGIN_REQUIRED'
    });
  });
});
