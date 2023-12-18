const urlJoin = require('url-join');
const { ControlledContainerMixin } = require('@semapps/ldp');
const { ACTOR_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const { triple, namedNode } = require('@rdfjs/data-model');
const { interopContext } = require('@activitypods/core');

const INTEROP_PREFIX = 'http://www.w3.org/ns/solid/interop#';

module.exports = {
  name: 'actors',
  mixins: [ControlledContainerMixin],
  settings: {
    app: {
      name: null,
      description: null,
      author: null,
      thumbnail: null
    },
    oidc: {
      clientUri: null,
      redirectUris: [],
      postLogoutRedirectUris: [],
      tosUri: null
    },
    // ControlledContainerMixin settings
    path: '/as/actor',
    acceptedTypes: [ACTOR_TYPES.APPLICATION, 'interop:Application'],
    readOnly: true
  },
  dependencies: [
    'activitypub',
    'activitypub.follow', // Ensure the /followers and /following collection are registered
    'auth.account',
    'ldp.container',
    'ldp.registry'
  ],
  actions: {
    async createApp(ctx) {
      // Ensure LDP sub-services have been started
      await this.broker.waitForServices(['ldp.container', 'ldp.resource']);

      let actorExist = false,
        actorUri;

      const actorAccount = await ctx.call('auth.account.findByUsername', { username: 'app' });

      if (actorAccount) {
        actorUri = actorAccount.webId;
        actorExist = await ctx.call('ldp.resource.exist', {
          resourceUri: actorUri
        });
      }

      if (!actorExist) {
        this.logger.info(`Actor ${actorUri} does not exist yet, creating it...`);

        const account = await ctx.call(
          'auth.account.create',
          {
            username: 'app'
          },
          { meta: { isSystemCall: true } }
        );

        try {
          actorUri = await this.actions.post(
            {
              slug: 'app',
              resource: {
                '@context': ['https://www.w3.org/ns/activitystreams', interopContext],
                type: [ACTOR_TYPES.APPLICATION, 'interop:Application'],
                preferredUsername: 'app',
                name: this.settings.app.name,
                'interop:applicationName': this.settings.app.name,
                'interop:applicationDescription': this.settings.app.description,
                'interop:applicationAuthor': this.settings.app.author,
                'interop:applicationThumbnail': this.settings.app.thumbnail,
                'oidc:client_name': this.settings.app.name,
                'oidc:redirect_uris': this.settings.oidc.redirectUris,
                'oidc:post_logout_redirect_uris': this.settings.oidc.postLogoutRedirectUris,
                'oidc:client_uri': this.settings.oidc.clientUri,
                'oidc:logo_uri': this.settings.app.thumbnail,
                'oidc:tos_uri': this.settings.oidc.tosUri,
                'oidc:scope': 'openid profile offline_access webid',
                'oidc:grant_types': ['refresh_token', 'authorization_code'],
                'oidc:response_types': ['code'],
                'oidc:default_max_age': 3600,
                'oidc:require_auth_time': true
              },
              contentType: MIME_TYPES.JSON,
              webId: 'system'
            },
            { parentCtx: ctx }
          );

          await ctx.call(
            'auth.account.attachWebId',
            {
              accountUri: account['@id'],
              webId: actorUri
            },
            { meta: { isSystemCall: true } }
          );
        } catch (e) {
          // Delete account if resource creation failed, or it may cause problems when retrying
          await ctx.call('auth.account.remove', { id: account['@id'] });
          throw e;
        }

        this.appActor = await ctx.call('activitypub.actor.awaitCreateComplete', { actorUri });

        await ctx.call('access-needs-groups.initialize');
      } else {
        this.appActor = await ctx.call('activitypub.actor.awaitCreateComplete', { actorUri });
      }

      await ctx.call('nodeinfo.addLink', {
        rel: 'https://www.w3.org/ns/activitystreams#Application',
        href: this.appActor.id
      });

      return this.appActor;
    },
    async attachAccessNeedGroup(ctx) {
      const { accessNeedGroupUri } = ctx.params;
      await ctx.call('ldp.resource.patch', {
        resourceUri: this.appActor.id,
        triplesToAdd: [
          triple(
            namedNode(this.appActor.id),
            namedNode(INTEROP_PREFIX + 'hasAccessNeedGroup'),
            namedNode(accessNeedGroupUri)
          )
        ],
        webId: 'system'
      });
    }
  }
};
