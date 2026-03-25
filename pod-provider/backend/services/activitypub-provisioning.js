const { MoleculerError } = require('moleculer').Errors;

module.exports = {
  name: 'activitypub-provisioning',
  dependencies: ['activitypub'],
  actions: {
    provisionForAccount: {
      params: {
        canonicalAccountId: 'string|min:1',
        webId: 'string|min:1',
        username: 'string|min:1',
        profile: { type: 'object', optional: true }
      },
      async handler(ctx) {
        const { canonicalAccountId, webId, username } = ctx.params;

        if (canonicalAccountId !== webId) {
          throw new MoleculerError(
            'Current provisioning path requires canonicalAccountId to equal webId',
            400,
            'CANONICAL_ACCOUNT_ID_WEBID_MISMATCH'
          );
        }

        const actor = await ctx.call('activitypub.actor.awaitCreateComplete', {
          actorUri: webId,
          additionalKeys: ['preferredUsername', 'inbox', 'outbox', 'followers', 'following']
        });

        if (!actor?.id || !actor?.inbox || !actor?.outbox) {
          throw new MoleculerError('ActivityPub actor provisioning is incomplete', 500, 'ACTIVITYPUB_PROVISIONING_FAILED');
        }

        const preferredUsername = actor.preferredUsername || username;
        const hostname = new URL(actor.id).hostname;

        return {
          actorId: actor.id,
          handle: `@${preferredUsername}@${hostname}`,
          inbox: actor.inbox,
          outbox: actor.outbox,
          followers: actor.followers || null,
          following: actor.following || null
        };
      }
    }
  }
};
