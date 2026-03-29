const crypto = require('crypto');
const { MoleculerError } = require('moleculer').Errors;
const { SignJWT, importJWK, jwtVerify } = require('jose');
const { nowEpochSec, parseIntWithBounds, parseBoolean } = require('../../utils/oauth-security');
const CONFIG = require('../../config/config');

const baseUrl = process.env.SEMAPPS_HOME_URL || CONFIG.BASE_URL || '';

function base64UrlSha256(input) {
  return crypto.createHash('sha256').update(String(input), 'utf8').digest('base64url');
}

module.exports = {
  name: 'oauth-token',
  dependencies: ['oauth-code-store', 'oauth-refresh-session', 'oauth-dpop-nonce', 'jwk'],

  settings: {
    issuer: process.env.OAUTH_ISSUER || baseUrl,
    resource: process.env.OAUTH_PROTECTED_RESOURCE_URL || baseUrl,
    audience: process.env.OAUTH_TOKEN_AUDIENCE || process.env.OAUTH_PROTECTED_RESOURCE_URL || baseUrl,
    accessTtlSec: parseIntWithBounds(process.env.OAUTH_ACCESS_TTL_SECONDS, 3600, 60, 7200, 'OAUTH_ACCESS_TTL_SECONDS'),
    allowLocalhostHttp: parseBoolean(process.env.OAUTH_ENABLE_LOCALHOST_DEV, false)
  },

  actions: {
    exchange: {
      params: {
        grant_type: { type: 'string', min: 1 },
        client_id: { type: 'string', min: 1 },
        redirect_uri: { type: 'string', optional: true },
        code: { type: 'string', optional: true },
        code_verifier: { type: 'string', optional: true },
        refresh_token: { type: 'string', optional: true },
        dpop_proof: { type: 'string', min: 10 },
        dpop_nonce: { type: 'string', optional: true },
        htm: { type: 'string', min: 1 },
        htu: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const input = ctx.params;
        const proof = await ctx.call('oauth-dpop-nonce.verifyProof', {
          proofJwt: input.dpop_proof,
          htm: input.htm,
          htu: input.htu,
          audience: this.settings.audience,
          nonce: input.dpop_nonce
        });

        if (input.grant_type === 'authorization_code') {
          return this.handleAuthorizationCode(ctx, input, proof.jkt);
        }

        if (input.grant_type === 'refresh_token') {
          return this.handleRefreshToken(ctx, input, proof.jkt);
        }

        throw new MoleculerError('Unsupported grant_type', 400, 'INVALID_GRANT');
      }
    },

    introspectAccessToken: {
      params: {
        token: { type: 'string', min: 20 }
      },
      async handler(ctx) {
        const token = String(ctx.params.token).trim();
        const { publicJwk } = await ctx.call('jwk.get');
        const publicKey = await importJWK(publicJwk, String(publicJwk.alg || 'ES256'));

        try {
          const { payload } = await jwtVerify(token, publicKey, {
            issuer: this.settings.issuer,
            audience: this.settings.audience
          });

          return {
            active: true,
            sub: payload.sub,
            scope: payload.scope,
            client_id: payload.client_id,
            canonical_account_id: payload.canonical_account_id,
            cnf: payload.cnf,
            exp: payload.exp
          };
        } catch (_error) {
          return { active: false };
        }
      }
    }
  },

  methods: {
    async handleAuthorizationCode(ctx, input, dpopJkt) {
      if (!input.code || !input.code_verifier || !input.redirect_uri) {
        throw new MoleculerError('Missing authorization_code parameters', 400, 'INVALID_GRANT');
      }

      const record = await ctx.call('oauth-code-store.consumeCode', { code: input.code });
      if (record.clientId !== input.client_id) {
        throw new MoleculerError('client_id mismatch for code', 400, 'INVALID_GRANT');
      }
      if (record.redirectUri !== input.redirect_uri) {
        throw new MoleculerError('redirect_uri mismatch for code', 400, 'INVALID_GRANT');
      }
      if (record.dpopJkt !== dpopJkt) {
        throw new MoleculerError('DPoP binding mismatch for authorization code', 401, 'INVALID_DPOP_PROOF');
      }
      if (record.codeChallengeMethod !== 'S256') {
        throw new MoleculerError('Unsupported code challenge method', 400, 'PKCE_VERIFICATION_FAILED');
      }

      const verifierHash = base64UrlSha256(input.code_verifier);
      if (verifierHash !== record.codeChallenge) {
        throw new MoleculerError('PKCE verification failed', 400, 'PKCE_VERIFICATION_FAILED');
      }

      const token = await this.issueAccessToken({
        sub: record.did,
        canonicalAccountId: record.canonicalAccountId,
        clientId: record.clientId,
        scope: record.scope,
        dpopJkt
      }, ctx);

      const refresh = await ctx.call('oauth-refresh-session.issueRefreshToken', {
        did: record.did,
        canonicalAccountId: record.canonicalAccountId,
        clientId: record.clientId,
        scope: record.scope,
        dpopJkt
      });

      return {
        access_token: token,
        token_type: 'DPoP',
        expires_in: this.settings.accessTtlSec,
        refresh_token: refresh.refreshToken,
        scope: record.scope,
        sub: record.did
      };
    },

    async handleRefreshToken(ctx, input, dpopJkt) {
      if (!input.refresh_token) {
        throw new MoleculerError('Missing refresh_token', 400, 'INVALID_GRANT');
      }

      const rotated = await ctx.call('oauth-refresh-session.rotateRefreshToken', {
        refreshToken: input.refresh_token,
        dpopJkt
      });

      if (rotated.clientId !== input.client_id) {
        throw new MoleculerError('refresh token client mismatch', 400, 'INVALID_GRANT');
      }

      const token = await this.issueAccessToken({
        sub: rotated.did,
        canonicalAccountId: rotated.canonicalAccountId,
        clientId: rotated.clientId,
        scope: rotated.scope,
        dpopJkt
      }, ctx);

      return {
        access_token: token,
        token_type: 'DPoP',
        expires_in: this.settings.accessTtlSec,
        refresh_token: rotated.refreshToken,
        scope: rotated.scope,
        sub: rotated.did
      };
    },

    async issueAccessToken(session, ctx) {
      const { privateJwk } = await ctx.call('jwk.get');
      const privateKey = await importJWK(privateJwk, String(privateJwk.alg || 'ES256'));
      const now = nowEpochSec();

      return await new SignJWT({
        scope: session.scope,
        client_id: session.clientId,
        canonical_account_id: session.canonicalAccountId,
        cnf: { jkt: session.dpopJkt }
      })
        .setProtectedHeader({ alg: String(privateJwk.alg || 'ES256'), typ: 'at+jwt' })
        .setIssuer(this.settings.issuer)
        .setAudience(this.settings.audience)
        .setSubject(session.sub)
        .setJti(crypto.randomUUID())
        .setIssuedAt(now)
        .setExpirationTime(now + this.settings.accessTtlSec)
        .sign(privateKey);
    }
  }
};
