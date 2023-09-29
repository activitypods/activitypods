const { ControlledContainerMixin, delay } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');

const CAPABILITIES_ROUTE = '/capabilities';

/**
 * Service to host the capabilities container.
 *
 * @type {import('moleculer').ServiceSchema}
 *
 */
const CapabilitiesService = {
  name: 'capabilities',
  mixins: [ControlledContainerMixin],
  settings: {
    path: CAPABILITIES_ROUTE,
    excludeFromMirror: true,
    permissions: {},
    newResourcesPermissions: {}
  },
  hooks: {
    before: {
      /**
       * Bypass authorization when getting the resource.
       *
       * The URI itself is considered the secret. So no more
       * authorization is necessary at this point.
       * If we decide to support capabilities with multiple
       * authorization factors, this will have to change in
       * the future.
       */
      get: ctx => {
        ctx.params.webId = 'system';
      }
    }
  },
  events: {
    /**
     * A new user was registered:
     * - Add the capabilities container URI to the webId document.
     * - Add an invite capability to the capabilities container.
     */
    async 'auth.registered'(ctx) {
      const { webId } = ctx.params;

      this.actions.createInviteCapability({
        webId
      });
    }
  },
  actions: {
    createInviteCapability: {
      params: {
        webId: { type: 'string', optional: false }
      },
      handler: async function (ctx) {
        const { webId } = ctx.params;

        const capContainerUriPromise = this.actions.getContainerUri({ webId }, { parentCtx: ctx });

        // The profile might not have been created, so we await its URI.
        const { url: profileUri } = await ctx.call('ldp.resource.awaitCreateComplete', {
          resourceUri: webId,
          predicates: ['url']
        });

        // The capability container creation might not have finished, so wait until it has.
        await this.actions.waitForContainerCreation({ containerUri: await capContainerUriPromise }, { parentCtx: ctx });

        // Add an invite capability.
        const inviteCapUri = await this.actions.post(
          {
            containerUri: await capContainerUriPromise,
            resource: {
              '@type': 'acl:Authorization',
              'acl:AccessTo': profileUri,
              'acl:Mode': 'acl:Read'
            },
            contentType: MIME_TYPES.JSON,
            webId
          },
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
            const capContainerUri = await this.actions.getContainerUri({ webId });

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
              await this.actions.createInviteCapability({ webId });
            }
          })
        );
      }
    }
  }
};

module.exports = CapabilitiesService;
