const { MIME_TYPES } = require('@semapps/mime-types');
const { arrayOf } = require('@semapps/ldp');

/**
 * Service to create acl:Read authorization capability URIs for new users' profiles.
 *
 * Those can be used, to invite people who are not yet registered. With the capability,
 *  the new user can see the inviter's profile and after account creation add the
 *  contact without further authorization by the inviter.
 *
 * @type {import('moleculer').ServiceSchema}
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

        if (profileUri) {
          // Add an invite capability.
          const inviteCapUri = await ctx.call(
            'capabilities.createCapability',
            { accessTo: profileUri, mode: 'acl:Read', webId },
            { parentCtx: ctx }
          );

          return inviteCapUri;
        } else {
          this.logger.warn(`Unable to find a profile for webId ${webId}`);
        }
      }
    },
    // Add invite cap to each capabilities container, where missing.
    addCapsContainersWhereMissing: {
      handler: async function (ctx) {
        /** @type {string[]} */
        for (const account of await ctx.call('auth.account.find')) {
          const webId = account.webId;
          ctx.meta.dataset = account.username;

          const { url: profileUri } = await ctx.call('ldp.resource.get', {
            resourceUri: webId,
            accept: MIME_TYPES.JSON
          });

          const capContainerUri = await ctx.call('capabilities.getContainerUri', { webId });

          // Get all existing caps
          const inviteCaps = await ctx.call('ldp.container.get', {
            containerUri: capContainerUri,
            accept: MIME_TYPES.JSON,
            webId: 'system'
          });

          const hasInviteCap = arrayOf(inviteCaps['ldp:contains']).some(
            cap =>
              cap.type === 'acl:Authorization' && cap['acl:mode'] === 'acl:Read' && cap['acl:accessTo'] === profileUri
          );

          if (!hasInviteCap) {
            this.logger.info('Migration: Adding invite capability for dataset ' + account.username + '...');
            await this.actions.createProfileCapability({ webId });
          }
        }
      }
    }
  }
};

module.exports = CapabilitiesProfileService;
