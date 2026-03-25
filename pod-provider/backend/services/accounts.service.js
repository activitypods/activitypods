const { MoleculerError } = require('moleculer').Errors;

module.exports = {
  name: 'accounts',
  dependencies: ['auth'],
  actions: {
    create: {
      params: {
        username: 'string|min:1',
        email: { type: 'string', optional: true },
        password: 'string|min:8',
        profile: {
          type: 'object',
          props: {
            displayName: 'string|min:1',
            summary: { type: 'string', optional: true }
          }
        }
      },
      async handler(ctx) {
        const { username, email, password, profile } = ctx.params;

        const existing = await ctx.call('auth.account.findByUsername', { username });
        if (existing) {
          throw new MoleculerError('An account already exists for this username', 409, 'ACCOUNT_ALREADY_EXISTS');
        }

        const signupPayload = {
          username,
          password,
          name: profile.displayName
        };

        if (email) signupPayload.email = email;
        if (profile.summary) signupPayload.summary = profile.summary;

        const signupResult = await ctx.call('auth.signup', signupPayload);
        if (!signupResult?.webId) {
          throw new MoleculerError('Account signup failed to return a webId', 500, 'ACCOUNT_CREATE_FAILED');
        }

        const account = await ctx.call('auth.account.findByWebId', { webId: signupResult.webId });

        return {
          canonicalAccountId: signupResult.webId,
          username,
          email: email || account?.email || null,
          createdAt: account?.createdAt || new Date().toISOString(),
          status: account?.disabled ? 'disabled' : 'active'
        };
      }
    }
  }
};
