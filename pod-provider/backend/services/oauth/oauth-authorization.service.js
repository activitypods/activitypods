const { MoleculerError } = require('moleculer').Errors;

module.exports = {
  name: 'oauth-authorization',
  dependencies: ['oauth-par', 'oauth-code-store', 'oauth-consent', 'oauth-consent-challenge', 'identitybindings'],

  actions: {
    getAuthorizationContext: {
      params: {
        request_uri: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const record = await ctx.call('oauth-par.get', {
          requestUri: ctx.params.request_uri
        });

        if (!record) {
          throw new MoleculerError('request_uri is invalid or expired', 400, 'INVALID_REQUEST_URI');
        }

        return {
          request_uri: record.requestUri,
          client_id: record.clientId,
          scope: record.scope,
          expires_at: record.expiresAt,
          redirect_uri: record.redirectUri,
          login_hint: record.loginHint || undefined
        };
      }
    },

    authorize: {
      params: {
        request_uri: { type: 'string', min: 1 },
        decision: { type: 'enum', values: ['approve', 'deny'] },
        consentChallenge: { type: 'string', min: 8 },
        requestFingerprint: { type: 'string', min: 8 },
        csrfToken: { type: 'string', min: 16 },
        canonicalAccountId: { type: 'string', min: 1 }
      },
      async handler(ctx) {
        const requestUri = String(ctx.params.request_uri).trim();
        const challenge = await ctx.call('oauth-consent-challenge.consume', {
          challengeId: ctx.params.consentChallenge
        });

        if (!challenge) {
          throw new MoleculerError('Consent challenge is invalid or expired', 400, 'INVALID_REQUEST_URI');
        }

        if (challenge.requestUri !== requestUri) {
          throw new MoleculerError('Consent challenge request mismatch', 400, 'INVALID_REQUEST_URI');
        }

        if (challenge.fingerprint !== ctx.params.requestFingerprint) {
          throw new MoleculerError('Consent challenge fingerprint mismatch', 403, 'LOGIN_REQUIRED');
        }

        const csrfValid = await ctx.call('oauth-consent-challenge.verifyCsrf', {
          expectedHash: challenge.csrfHash,
          csrfToken: ctx.params.csrfToken
        });
        if (!csrfValid) {
          throw new MoleculerError('CSRF validation failed', 403, 'LOGIN_REQUIRED');
        }

        const parRecord = await ctx.call('oauth-par.consume', { requestUri });

        if (!parRecord) {
          throw new MoleculerError('request_uri is invalid or expired', 400, 'INVALID_REQUEST_URI');
        }

        if (ctx.params.decision === 'deny') {
          return {
            redirect_uri: this.buildRedirect(parRecord.redirectUri, {
              error: 'access_denied',
              state: parRecord.state
            })
          };
        }

        if (!ctx.params.canonicalAccountId) {
          throw new MoleculerError('Login is required to approve authorization', 401, 'LOGIN_REQUIRED');
        }

        const binding = await ctx.call('identitybindings.getByCanonicalAccountId', {
          canonicalAccountId: String(ctx.params.canonicalAccountId).trim()
        });

        if (!binding || !binding.atprotoDid || binding.atprotoManaged === false) {
          throw new MoleculerError('Managed local account is required for this authorization flow', 403, 'LOGIN_REQUIRED');
        }

        await ctx.call('oauth-consent.upsert', {
          canonicalAccountId: binding.canonicalAccountId,
          clientId: parRecord.clientId,
          scope: parRecord.scope
        });

        const code = await ctx.call('oauth-code-store.issueCode', {
          clientId: parRecord.clientId,
          redirectUri: parRecord.redirectUri,
          canonicalAccountId: binding.canonicalAccountId,
          did: binding.atprotoDid,
          scope: parRecord.scope,
          dpopJkt: parRecord.dpopJkt,
          codeChallenge: parRecord.codeChallenge,
          codeChallengeMethod: parRecord.codeChallengeMethod,
          state: parRecord.state
        });

        return {
          redirect_uri: this.buildRedirect(parRecord.redirectUri, {
            code: code.code,
            state: parRecord.state
          })
        };
      }
    }
  },

  methods: {
    buildRedirect(base, params) {
      const url = new URL(base);
      for (const [key, value] of Object.entries(params || {})) {
        if (value == null || value === '') continue;
        url.searchParams.set(key, String(value));
      }
      return url.toString();
    }
  }
};
