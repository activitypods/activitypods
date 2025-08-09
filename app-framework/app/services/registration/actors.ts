import urlJoin from 'url-join';
import rdf from '@rdfjs/data-model';
import { ControlledContainerMixin, DereferenceMixin } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';
// @ts-expect-error TS(6059): File '/home/laurin/projects/virtual-assembly/semap... Remove this comment to see the full error message
import { ACTOR_TYPES } from '@semapps/activitypub';
// @ts-expect-error TS(2305): Module '"moleculer"' has no exported member 'defin... Remove this comment to see the full error message
import { ServiceSchema, defineAction } from 'moleculer';

const ActorsSchema = {
  name: 'actors' as const,
  // @ts-expect-error TS(2322): Type '{ settings: { path: null; acceptedTypes: nul... Remove this comment to see the full error message
  mixins: [ControlledContainerMixin, DereferenceMixin],
  settings: {
    path: '/as/actor',
    acceptedTypes: [ACTOR_TYPES.APPLICATION, 'interop:Application'],
    readOnly: true,
    dereferencePlan: [{ property: 'publicKey' }, { property: 'assertionMethod' }]
  },
  actions: {
    createOrUpdateApp: defineAction({
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        const { app, oidc } = ctx.params;

        const actorAccount = await ctx.call('auth.account.findByUsername', { username: 'app' });
        let actorUri = actorAccount?.webId;
        const actorExist = actorUri && (await ctx.call('ldp.resource.exist', { resourceUri: actorUri }));

        const description =
          typeof app.description === 'string'
            ? app.description
            : Object.entries(app.description).map(([key, value]) => ({
                '@value': value,
                '@language': key
              }));

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
                  type: [ACTOR_TYPES.APPLICATION, 'interop:Application'],
                  preferredUsername: 'app',
                  name: app.name,
                  'interop:applicationName': app.name,
                  'interop:applicationDescription': description,
                  'interop:applicationAuthor': app.author,
                  'interop:applicationThumbnail': app.thumbnail,
                  'interop:hasAuthorizationCallbackEndpoint':
                    app.authCallbackEndpoint || (app.frontUrl && urlJoin(app.frontUrl, 'login') + '?register_app=true'),
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
                  'oidc:require_auth_time': true,
                  'dc:language': app.supportedLocales
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
                'interop:applicationDescription': description,
                'interop:applicationAuthor': app.author,
                'interop:applicationThumbnail': app.thumbnail,
                'interop:hasAuthorizationCallbackEndpoint':
                  app.authCallbackEndpoint || (app.frontUrl && urlJoin(app.frontUrl, 'login') + '?register_app=true'),
                'oidc:client_name': app.name,
                'oidc:redirect_uris': oidc.redirectUris,
                'oidc:post_logout_redirect_uris': oidc.postLogoutRedirectUris,
                'oidc:client_uri': oidc.clientUri,
                'oidc:logo_uri': app.thumbnail,
                'oidc:tos_uri': oidc.tosUri,
                'dc:language': app.supportedLocales
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
      }
    }),

    attachAccessNeedGroup: defineAction({
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        const { accessNeedGroupUri } = ctx.params;
        await this.actions.patch(
          {
            resourceUri: this.appActor.id,
            triplesToAdd: [
              rdf.quad(
                rdf.namedNode(this.appActor.id),
                rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAccessNeedGroup'),
                rdf.namedNode(accessNeedGroupUri)
              )
            ],
            webId: 'system'
          },
          { parentCtx: ctx }
        );
      }
    }),

    detachAccessNeedGroup: defineAction({
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        const { accessNeedGroupUri } = ctx.params;
        await this.actions.patch(
          {
            resourceUri: this.appActor.id,
            triplesToRemove: [
              rdf.quad(
                rdf.namedNode(this.appActor.id),
                rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAccessNeedGroup'),
                rdf.namedNode(accessNeedGroupUri)
              )
            ],
            webId: 'system'
          },
          { parentCtx: ctx }
        );
      }
    }),

    attachAccessDescriptionSet: defineAction({
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        const { accessDescriptionSetUri } = ctx.params;
        await this.actions.patch(
          {
            resourceUri: this.appActor.id,
            triplesToAdd: [
              rdf.quad(
                rdf.namedNode(this.appActor.id),
                rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAccessDescriptionSet'),
                rdf.namedNode(accessDescriptionSetUri)
              )
            ],
            webId: 'system'
          },
          { parentCtx: ctx }
        );
      }
    }),

    detachAccessDescriptionSet: defineAction({
      // @ts-expect-error TS(7006): Parameter 'ctx' implicitly has an 'any' type.
      async handler(ctx) {
        const { accessDescriptionSetUri } = ctx.params;
        await this.actions.patch(
          {
            resourceUri: this.appActor.id,
            triplesToRemove: [
              rdf.quad(
                rdf.namedNode(this.appActor.id),
                rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAccessDescriptionSet'),
                rdf.namedNode(accessDescriptionSetUri)
              )
            ],
            webId: 'system'
          },
          { parentCtx: ctx }
        );
      }
    })
  }
} satisfies ServiceSchema;

export default ActorsSchema;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [ActorsSchema.name]: typeof ActorsSchema;
    }
  }
}
