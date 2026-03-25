const urlJoin = require('url-join');
const { MoleculerError } = require('moleculer').Errors;

module.exports = {
  name: 'webid-provisioning',
  dependencies: ['auth', 'solid-storage'],
  actions: {
    create: {
      params: {
        canonicalAccountId: 'string|min:1',
        username: 'string|min:1',
        profile: { type: 'object', optional: true }
      },
      async handler(ctx) {
        const { canonicalAccountId, username } = ctx.params;

        const account = await ctx.call('auth.account.findByUsername', { username });
        if (!account?.webId) {
          throw new MoleculerError('Account not found during WebID provisioning', 404, 'ACCOUNT_NOT_FOUND');
        }

        if (account.webId !== canonicalAccountId) {
          throw new MoleculerError(
            'Current provisioning path requires canonicalAccountId to match account.webId',
            400,
            'CANONICAL_ACCOUNT_MISMATCH'
          );
        }

        let podBaseUrl;
        try {
          podBaseUrl = await ctx.call('solid-storage.getUrl', { webId: account.webId });
        } catch (_e) {
          podBaseUrl = urlJoin(account.webId, 'data');
        }

        return {
          webId: account.webId,
          podBaseUrl
        };
      }
    }
  }
};
