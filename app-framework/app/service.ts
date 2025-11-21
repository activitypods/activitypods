// @ts-expect-error TS(7016): Could not find a declaration file for module 'mole... Remove this comment to see the full error message
import QueueMixin from 'moleculer-bull';
import urlJoin from 'url-join';
import rdf from '@rdfjs/data-model';
import { arrayOf } from '@semapps/ldp';
import { ACTOR_TYPES } from '@semapps/activitypub';
import AccessNeedsService from './services/registration/access-needs.ts';
import AccessNeedsGroupsService from './services/registration/access-needs-groups.ts';
import AppRegistrationsService from './services/registration/app-registrations.ts';
import AccessGrantsService from './services/registration/access-grants.ts';
import RegistrationService from './services/registration/registration.ts';
import PodActivitiesWatcherService from './services/pod-handling/pod-activities-watcher.ts';
import PodCollectionsService from './services/pod-handling/pod-collections.ts';
import PodContainersService from './services/pod-handling/pod-containers.ts';
import PodNotificationService from './services/pod-handling/pod-notification.ts';
import PodOutboxService from './services/pod-handling/pod-outbox.ts';
import PodPermissionsService from './services/pod-handling/pod-permissions.ts';
import PodResourcesService from './services/pod-handling/pod-resources.ts';
import PodWacGroupsService from './services/pod-handling/pod-wac-groups.ts';
import ShaclService from './services/utils/shacl.ts';
import ShapeTreesService from './services/utils/shape-trees.ts';
import TimerService from './services/utils/timer.ts';
import TranslatorService from './services/utils/translator.ts';
import MigrationService from './services/utils/migration.ts';
import { ServiceSchema } from 'moleculer';
import { Account } from '../../../semapps/src/middleware/packages/auth/types.ts';

const AppService = {
  name: 'app' as const,
  settings: {
    username: 'app',
    baseUrl: null,
    app: {
      name: null,
      description: null,
      author: null,
      thumbnail: null,
      frontUrl: null,
      authCallbackEndpoint: null, // If not defined, will use the front URL + /login?register_app=true
      supportedLocales: []
    },
    oidc: {
      clientUri: null,
      redirectUris: null,
      postLogoutRedirectUris: [],
      tosUri: null
    },
    accessNeeds: {
      required: [],
      optional: []
    },
    queueServiceUrl: null
  },
  dependencies: [
    'activitypub',
    'activitypub.follow', // Ensure the /followers and /following collection are registered
    'auth.account',
    'pod-activities-watcher',
    'ldp.container',
    'ldp.registry',
    'ldp.resource',
    'access-needs-groups'
  ],
  created() {
    if (!this.settings.queueServiceUrl) {
      throw new Error(`The setting queueServiceUrl is mandatory`);
    }

    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [RegistrationService] });

    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [AccessNeedsService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [AccessNeedsGroupsService] });

    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [AppRegistrationsService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [AccessGrantsService] });

    // Pod handling
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({
      mixins: [PodActivitiesWatcherService, QueueMixin(this.settings.queueServiceUrl)]
    });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({
      mixins: [PodNotificationService],
      settings: {
        frontUrl: this.settings.app.frontUrl
      }
    });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [PodCollectionsService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [PodContainersService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [PodOutboxService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [PodPermissionsService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [PodResourcesService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [PodWacGroupsService] });

    // Utils
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [ShaclService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [ShapeTreesService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({
      mixins: [TimerService, QueueMixin(this.settings.queueServiceUrl)]
    });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [TranslatorService] });
    // @ts-expect-error TS(2339): Property 'broker' does not exist on type 'void'.
    this.broker.createService({ mixins: [MigrationService], settings: { baseUrl: this.settings.baseUrl } });
  },
  async started() {
    await this.actions.createOrUpdate({});

    this.broker.call('pod-activities-watcher.registerAllListeners', {}, { meta: { dataset: this.settings.username } });
  },
  actions: {
    get: {
      async handler(ctx: any) {
        return await ctx.call('webid.get');
      }
    },
    getUri: {
      handler() {
        return this.appUri;
      }
    },
    createOrUpdate: {
      async handler(ctx: any) {
        const { username, accessNeeds } = this.settings;

        ctx.meta.dataset = username;

        let account: Account = await this.broker.call('auth.account.findByUsername', { username });

        if (!account) {
          account = await ctx.call('auth.account.create', { username });
        }

        this.appUri = account.webId;

        await this.actions.appendAppData({ webId: this.appUri }, { parentCtx: ctx });

        await ctx.call('nodeinfo.addLink', {
          rel: 'https://www.w3.org/ns/activitystreams#Application',
          href: this.appUri
        });

        // Don't await because the access-needs-groups service need to call the app service
        ctx.call('access-needs-groups.createOrUpdate', {
          accessNeeds: {
            // Ensure we have one key per necessity, otherwise we may fail to delete unused access needs
            required: arrayOf(accessNeeds.required),
            optional: arrayOf(accessNeeds.optional)
          }
        });
      }
    },
    appendAppData: {
      async handler(ctx: any) {
        const { webId } = ctx.params;
        const { app, oidc } = this.settings;

        const actor = await ctx.call('activitypub.actor.awaitCreateComplete', {
          actorUri: webId,
          additionalKeys: ['pim:storage', 'solid:oidcIssuer', 'solid:publicTypeIndex'] // TODO Don't include solid:oidcIssuer for apps
        });

        const description =
          typeof app.description === 'string'
            ? app.description
            : Object.entries(app.description).map(([key, value]) => ({
                '@value': value,
                '@language': key
              }));

        await ctx.call('ldp.resource.put', {
          resourceUri: webId,
          resource: {
            ...actor,
            type: [...arrayOf(actor.type), ACTOR_TYPES.APPLICATION, 'interop:Application'],
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
          webId: 'system'
        });
      }
    },

    attachAccessNeedGroup: {
      async handler(ctx: any) {
        const { accessNeedGroupUri } = ctx.params;

        await ctx.call('webid.patch', {
          resourceUri: this.appUri,
          triplesToAdd: [
            rdf.quad(
              rdf.namedNode(this.appUri),
              rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAccessNeedGroup'),
              rdf.namedNode(accessNeedGroupUri)
            )
          ],
          webId: 'system'
        });
      }
    },

    detachAccessNeedGroup: {
      async handler(ctx: any) {
        const { accessNeedGroupUri } = ctx.params;

        await ctx.call('webid.patch', {
          resourceUri: this.appUri,
          triplesToRemove: [
            rdf.quad(
              rdf.namedNode(this.appUri),
              rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAccessNeedGroup'),
              rdf.namedNode(accessNeedGroupUri)
            )
          ],
          webId: 'system'
        });
      }
    },

    attachAccessDescriptionSet: {
      async handler(ctx: any) {
        const { accessDescriptionSetUri } = ctx.params;

        await ctx.call('webid.patch', {
          resourceUri: this.appUri,
          triplesToAdd: [
            rdf.quad(
              rdf.namedNode(this.appUri),
              rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAccessDescriptionSet'),
              rdf.namedNode(accessDescriptionSetUri)
            )
          ],
          webId: 'system'
        });
      }
    },

    detachAccessDescriptionSet: {
      async handler(ctx: any) {
        const { accessDescriptionSetUri } = ctx.params;

        await ctx.call('webid.patch', {
          resourceUri: this.appUri,
          triplesToRemove: [
            rdf.quad(
              rdf.namedNode(this.appUri),
              rdf.namedNode('http://www.w3.org/ns/solid/interop#hasAccessDescriptionSet'),
              rdf.namedNode(accessDescriptionSetUri)
            )
          ],
          webId: 'system'
        });
      }
    }
  }
} satisfies ServiceSchema;

export default AppService;

declare global {
  export namespace Moleculer {
    export interface AllServices {
      [AppService.name]: typeof AppService;
    }
  }
}
