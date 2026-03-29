module.exports = {
  name: 'oauth-refresh-family',
  dependencies: ['oauth-refresh-session'],

  actions: {
    issue: {
      async handler(ctx) {
        return ctx.call('oauth-refresh-session.issueRefreshToken', ctx.params);
      }
    },

    rotate: {
      async handler(ctx) {
        return ctx.call('oauth-refresh-session.rotateRefreshToken', ctx.params);
      }
    },

    revokeFamily: {
      async handler(ctx) {
        return ctx.call('oauth-refresh-session.revokeFamily', ctx.params);
      }
    }
  }
};
