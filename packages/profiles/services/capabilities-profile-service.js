const { MIME_TYPES } = require('@semapps/mime-types');

/**
 * Service to create acl:Read authorization capability URIs for new users' profiles.
 *
 * Those can be used, to invite people who are not yet registered. With the capability,
 *  the new user can see the inviter's profile and after account creation add the
 *  contact without further authorization by the inviter.
 *
 * @type {import('moleculer').ServiceSchema}
 *
 */
const CapabilitiesProfileService = {
  name: 'profiles.capabilities',

  events: {
    /**
     * A new user was registered:
     * - Add the capabilities container URI to the webId document.
     * - Add an invite capability to the capabilities container.
     */
    async 'auth.registered'(ctx) {
      const { webId } = ctx.params;

      // Cap container creation might not have finished (at least in tests), so wait until it has.
      const capContainerUri = await ctx.call('capabilities.getContainerUri', { webId }, { parentCtx: ctx });
      await ctx.call('capabilities.waitForContainerCreation', { containerUri: capContainerUri }, { parentCtx: ctx });
      // Same for profile URI (`url`).
      await ctx.call('ldp.resource.awaitCreateComplete', {
        resourceUri: webId,
        predicates: ['url']
      });

      this.actions.createProfileCapability({ webId }, { parentCtx: ctx });
    }
  },
  actions: {
    createProfileCapability: {
      params: {
        webId: { type: 'string', optional: false }
      },
      handler: async function (ctx) {
        const { webId } = ctx.params;

        const { url: profileUri } = await ctx.call('ldp.resource.get', {
          resourceUri: webId,
          webId: 'system',
          accept: MIME_TYPES.JSON
        });

        // Add an invite capability.
        const inviteCapUri = await ctx.call(
          'capabilities.createCapability',
          { accessTo: profileUri, mode: 'acl:Read', webId },
          { parentCtx: ctx }
        );

        return inviteCapUri;
      }
    },

    addCapsContainersWhereMissing: {
      params: {},
      handler: async function (ctx) {
        /** @type {string[]} */
        const datasets = await ctx.call('pod.list');

        // Add invite cap to each capabilities container, where missing.
        await Promise.all(
          datasets.map(async dataset => {
            const [account] = await this.broker.call('auth.account.find', { query: { username: dataset } });
            const webId = account.webId;

            const { url: profileUri } = await this.broker.call('ldp.resource.get', {
              resourceUri: webId,
              accept: MIME_TYPES.JSON
            });
            const capContainerUri = await ctx.call('capabilities.getContainerUri', { webId }, { parentCtx: ctx });

            // Get all existing caps
            const inviteCaps = await this.broker.call(
              'ldp.container.get',
              {
                containerUri: capContainerUri,
                accept: MIME_TYPES.JSON,
                webId: 'system'
              },
              { meta: { $cache: false } }
            );

            // Make caps an array for easier handling.
            const caps = (inviteCaps['ldp:contains'] && [inviteCaps['ldp:contains']].flatMap(i => i)) || [];

            const hasInviteCap = caps.some(cap => {
              return (cap.type =
                'acl:Authorization' && cap['acl:Mode'] === 'acl:Read' && cap['acl:AccessTo'] === profileUri);
            });

            if (!hasInviteCap) {
              this.logger.info('Migration: Adding invite capability for dataset ' + dataset + '...');
              await this.actions.createProfileCapability({ webId });
            }
          })
        );
      }
    }
  }
};

module.exports = CapabilitiesProfileService;
