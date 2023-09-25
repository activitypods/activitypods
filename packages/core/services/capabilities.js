const { ControlledContainerMixin, delay } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { triple, namedNode } = require('@rdfjs/data-model');
const fetch = require('node-fetch');

const CAPABILITIES_ROUTE = '/capabilities';
const CAP_DOC_PREDICATE = 'http://activitypods.org/ns/core#capabilities';

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
    newResourcesPermissions: {},
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
      get: (ctx) => {
        ctx.params.webId = 'system';
      },
    },
  },
  events: {
    /**
     * A new user was registered:
     * - Add the capabilities container URI to the webId document.
     * - Add an invite capability to the capabilities container.
     */
    async 'auth.registered'(ctx) {
      const { webId } = ctx.params;

      const capContainerUri = await this.actions.getContainerUri({ webId }, { parentCtx: ctx });

      // Add a reference to the webId document.
      ctx.call('ldp.resource.patch', {
        resourceUri: webId,
        triplesToAdd: [triple(namedNode(webId), namedNode(CAP_DOC_PREDICATE), namedNode(capContainerUri))],
        webId,
      });

      this.actions.createInviteCapability({
        webId,
      });
    },
  },
  actions: {
    createInviteCapability: {
      params: {
        webId: { type: 'string', optional: false },
      },
      handler: async function (ctx) {
        const { webId } = ctx.params;

        const capContainerUriPromise = this.actions.getContainerUri({ webId }, { parentCtx: ctx });

        // The profile might not have been created, so we await its URI.
        const profileUriPromise = (async () => {
          do {
            const webIdDoc = await ctx.call('ldp.resource.get', {
              resourceUri: webId,
              accept: MIME_TYPES.JSON,
              webId: 'system',
            });
            const profileUri = webIdDoc['url'];
            if (profileUri) {
              return profileUri;
            }
            delay(500);
          } while (true);
        })();

        // The capability container creation might not have finished, so wait until it has.
        await this.actions.waitForContainerCreation({ containerUri: await capContainerUriPromise }, { parentCtx: ctx });

        // Add an invite capability.
        const inviteCapUri = await this.actions.post(
          {
            containerUri: await capContainerUriPromise,
            resource: {
              '@type': 'http://www.w3.org/ns/auth/acl#Authorization',
              'http://www.w3.org/ns/auth/acl#AccessTo': await profileUriPromise,
              'http://www.w3.org/ns/auth/acl#Mode': 'http://www.w3.org/ns/auth/acl#Read',
            },
            contentType: MIME_TYPES.JSON,
            webId,
          },
          { parentCtx: ctx }
        );
        return inviteCapUri;
      },
    },

    addCapsContainersWhereMissing: {
      params: {},
      handler: async function (ctx) {
        /** @type {string[]} */
        const datasets = await ctx.call('pod.list');

        // Add invite cap to each capabilities container where missing.
        await Promise.all(
          datasets.map(async (dataset) => {
            const [account] = await ctx.call('auth.account.find', { query: { username: dataset } });
            const webId = account.webId;

            const webIdFetch = await fetch(webId, { headers: { accept: MIME_TYPES.JSON } });
            const webIdDoc = await webIdFetch.json();
            const profileUri = webIdDoc['url'];

            const capContainerUri =
              webIdDoc['apods:capabilities']?.id ||
              webIdDoc['apods:capabilities'] ||
              (await this.actions.getContainerUri({ webId }, { parentCtx: ctx }));

            // If the webId document does not reference the the capabilities container, update.
            if (!webIdDoc['apods:capabilities']) {
              // Add a reference to the webId document.
              await ctx.call('ldp.resource.patch', {
                resourceUri: webId,
                triplesToAdd: [triple(namedNode(webId), namedNode(CAP_DOC_PREDICATE), namedNode(capContainerUri))],
                webId: 'system',
              });
            }

            // Get all existing caps
            const inviteCaps = await ctx.call('ldp.container.get', {
              containerUri: capContainerUri,
              accept: MIME_TYPES.JSON,
              webId: 'system',
            });

            // Make caps an array for easier handling.
            const caps = (inviteCaps['ldp:contains'] && [inviteCaps['ldp:contains']].flatMap((i) => i)) || [];

            const hasInviteCap = caps.some((cap) => {
              return (cap.type =
                'http://www.w3.org/ns/auth/acl#Authorization' &&
                cap['http://www.w3.org/ns/auth/acl#Mode'] === 'http://www.w3.org/ns/auth/acl#Read' &&
                cap['http://www.w3.org/ns/auth/acl#AccessTo'] === profileUri);
            });

            if (!hasInviteCap) {
              this.logger.info('Adding invite capability for dataset ' + dataset + '...');
              await this.actions.createInviteCapability({ webId });
            }
          })
        );
      },
    },
  },
};

module.exports = CapabilitiesService;
