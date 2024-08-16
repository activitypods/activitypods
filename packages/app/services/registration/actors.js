const { triple, namedNode } = require('@rdfjs/data-model');
const { ControlledContainerMixin, DereferenceMixin } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { ACTOR_TYPES } = require('@semapps/activitypub');
const { interopContext } = require('@activitypods/core');

module.exports = {
  name: 'actors',
  mixins: [ControlledContainerMixin, DereferenceMixin],
  settings: {
    path: '/as/actor',
    acceptedTypes: [ACTOR_TYPES.APPLICATION, 'interop:Application'],
    readOnly: true,
    dereferencePlan: [{ property: 'publicKey' }, { property: 'assertionMethod' }]
  },
  actions: {
    async createOrUpdateApp(ctx) {
      const { app, oidc } = ctx.params;

      const actorAccount = await ctx.call('auth.account.findByUsername', { username: 'app' });
      let actorUri = actorAccount?.webId;
      const actorExist = actorUri && (await ctx.call('ldp.resource.exist', { resourceUri: actorUri }));

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
                name: app.name,
                'interop:applicationName': app.name,
                'interop:applicationDescription': app.description,
                'interop:applicationAuthor': app.author,
                'interop:applicationThumbnail': app.thumbnail,
                'oidc:client_name': app.name,
                'oidc:redirect_uris': oidc.redirectUris,
                'oidc:post_logout_redirect_uris': oidc.postLogoutRedirectUris,
                'oidc:client_uri': oidc.clientUri,
                'oidc:logo_uri': app.thumbnail,
                'oidc:tos_uri': oidc.tosUri,
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
      } else {
        this.logger.info(`Actor ${actorUri} exists already, updating it...`);

        const actor = await this.actions.get(
          {
            resourceUri: actorUri,
            accept: MIME_TYPES.JSON,
            webId: 'system'
          },
          { parentCtx: ctx }
        );

        // Only update the settings which may have changed
        await this.actions.put(
          {
            resource: {
              ...actor,
              name: app.name,
              'interop:applicationName': app.name,
              'interop:applicationDescription': app.description,
              'interop:applicationAuthor': app.author,
              'interop:applicationThumbnail': app.thumbnail,
              'oidc:client_name': app.name,
              'oidc:redirect_uris': oidc.redirectUris,
              'oidc:post_logout_redirect_uris': oidc.postLogoutRedirectUris,
              'oidc:client_uri': oidc.clientUri,
              'oidc:logo_uri': app.thumbnail,
              'oidc:tos_uri': oidc.tosUri
            },
            contentType: MIME_TYPES.JSON,
            webId: 'system'
          },
          { parentCtx: ctx }
        );

        // TODO Notify registered users to update the application in their cache (via Update activity)
        // The activity should not be sent if the PUT triggers no changes
      }

      this.appActor = await ctx.call('activitypub.actor.awaitCreateComplete', { actorUri });
      return this.appActor;
    },
    async attachAccessNeedGroup(ctx) {
      const { accessNeedGroupUri } = ctx.params;
      await this.actions.patch(
        {
          resourceUri: this.appActor.id,
          triplesToAdd: [
            triple(
              namedNode(this.appActor.id),
              namedNode('http://www.w3.org/ns/solid/interop#hasAccessNeedGroup'),
              namedNode(accessNeedGroupUri)
            )
          ],
          webId: 'system'
        },
        { parentCtx: ctx }
      );
    },
    async detachAccessNeedGroup(ctx) {
      const { accessNeedGroupUri } = ctx.params;
      await this.actions.patch(
        {
          resourceUri: this.appActor.id,
          triplesToRemove: [
            triple(
              namedNode(this.appActor.id),
              namedNode('http://www.w3.org/ns/solid/interop#hasAccessNeedGroup'),
              namedNode(accessNeedGroupUri)
            )
          ],
          webId: 'system'
        },
        { parentCtx: ctx }
      );
    },
    async attachAccessDescriptionSet(ctx) {
      const { accessDescriptionSetUri } = ctx.params;
      await this.actions.patch(
        {
          resourceUri: this.appActor.id,
          triplesToAdd: [
            triple(
              namedNode(this.appActor.id),
              namedNode('http://www.w3.org/ns/solid/interop#hasAccessDescriptionSet'),
              namedNode(accessDescriptionSetUri)
            )
          ],
          webId: 'system'
        },
        { parentCtx: ctx }
      );
    },
    async detachAccessDescriptionSet(ctx) {
      const { accessDescriptionSetUri } = ctx.params;
      await this.actions.patch(
        {
          resourceUri: this.appActor.id,
          triplesToRemove: [
            triple(
              namedNode(this.appActor.id),
              namedNode('http://www.w3.org/ns/solid/interop#hasAccessDescriptionSet'),
              namedNode(accessDescriptionSetUri)
            )
          ],
          webId: 'system'
        },
        { parentCtx: ctx }
      );
    }
  }
};
