const path = require('path');
const urlJoin = require('url-join');
const QueueService = require('moleculer-bull');
const { ActivityPubService, FULL_ACTOR_TYPES } = require('@semapps/activitypub');
const { AuthLocalService, AuthOIDCService } = require('@semapps/auth');
const { JsonLdService } = require('@semapps/jsonld');
const { LdpService, DocumentTaggerMixin } = require('@semapps/ldp');
const {
  OntologiesService,
  dc,
  syreen,
  mp,
  pair,
  void: voidOntology,
  interop,
  notify,
  oidc,
  solid
} = require('@semapps/ontologies');
const { PodService } = require('@semapps/solid');
const { NodeinfoService } = require('@semapps/nodeinfo');
const { SignatureService, ProxyService, KeysService } = require('@semapps/crypto');
const { SynchronizerService } = require('@semapps/sync');
const { SparqlEndpointService } = require('@semapps/sparql-endpoint');
const { TripleStoreService } = require('@semapps/triplestore');
const { WebAclService } = require('@semapps/webacl');
const { WebfingerService } = require('@semapps/webfinger');
const { WebIdService } = require('@semapps/webid');
const { AnnouncerService } = require('@activitypods/announcer');
const { NotificationProviderService } = require('@activitypods/solid-notifications');
const { TypeIndexesService } = require('@activitypods/type-index');
const { apods } = require('@activitypods/ontologies');
const { ManagementService } = require('./services/management');
const ApiService = require('./services/api');
const AppOpenerService = require('./services/app-opener');
const AppStatusService = require('./services/app-status');
const FilesService = require('./services/files');
const InstallationService = require('./services/installation');
const JWKService = require('./services/jwk');
const OidcProviderService = require('./services/oidc-provider/oidc-provider');
const MailNotificationsService = require('./services/mail-notifications');
const packageDesc = require('./package.json');

/** @type {import("moleculer").ServiceSchema} */
const CoreService = {
  name: 'core',
  settings: {
    baseUrl: null,
    baseDir: null,
    frontendUrl: null,
    triplestore: {
      url: null,
      user: null,
      password: null,
      fusekiBase: null
    },
    settingsDataset: 'settings',
    queueServiceUrl: null,
    authType: 'local',
    oidcProvider: {
      redisUrl: null,
      cookieSecret: 'COOKIE-SECRET'
    },
    notifications: {
      mail: {
        // See moleculer-mail doc https://github.com/moleculerjs/moleculer-addons/tree/master/packages/moleculer-mail
        from: null,
        transport: null,
        data: {
          color: '#E2003B'
        }
      }
    }
  },
  created() {
    const {
      baseUrl,
      baseDir,
      frontendUrl,
      triplestore,
      settingsDataset,
      queueServiceUrl,
      authType,
      oidcProvider,
      notifications
    } = this.settings;

    this.broker.createService({
      mixins: [ActivityPubService],
      settings: {
        baseUri: baseUrl,
        podProvider: true,
        queueServiceUrl
      }
    });

    this.broker.createService({
      mixins: [ApiService],
      settings: {
        ...this.settings.api,
        baseUrl,
        frontendUrl
      }
    });

    this.broker.createService({
      mixins: [authType === 'local' ? AuthLocalService : AuthOIDCService],
      settings: {
        baseUrl,
        jwtPath: path.resolve(baseDir, './jwt'),
        reservedUsernames: ['sparql', 'auth', 'common', 'data', 'settings', 'localData', 'testData'],
        webIdSelection: ['nick', 'schema:knowsLanguage'],
        formUrl: frontendUrl ? urlJoin(frontendUrl, 'login') : undefined,
        accountsDataset: settingsDataset,
        podProvider: true,
        ...this.settings.auth
      }
    });

    this.broker.createService({
      mixins: [JsonLdService],
      settings: {
        baseUri: baseUrl,
        cachedContextFiles: [
          {
            uri: 'https://www.w3.org/ns/activitystreams',
            file: path.resolve(__dirname, './config/context-as.json')
          }
        ]
      }
    });

    this.broker.createService({
      mixins: [OntologiesService],
      settings: {
        ontologies: [apods, interop, notify, oidc, solid, dc, syreen, mp, pair, voidOntology],
        persistRegistry: false,
        settingsDataset
      }
    });

    this.broker.createService({
      mixins: [LdpService, DocumentTaggerMixin],
      settings: {
        baseUrl,
        podProvider: true,
        resourcesWithContainerPath: false,
        defaultContainerOptions: {
          permissions: {},
          newResourcesPermissions: {}
        }
      }
    });

    this.broker.createService({
      mixins: [WebIdService],
      settings: {
        path: '/',
        baseUrl,
        acceptedTypes: Object.values(FULL_ACTOR_TYPES),
        podProvider: true,
        podsContainer: true // Will register the container but not create LDP containers on a dataset
      },
      hooks: {
        before: {
          async createWebId(ctx) {
            const { nick } = ctx.params;
            await ctx.call('pod.create', { username: nick });
            ctx.params['solid:oidcIssuer'] = baseUrl.replace(/\/$/, ''); // Remove trailing slash if it exists
          }
        }
      }
    });

    this.broker.createService({
      mixins: [PodService],
      settings: {
        baseUrl
      }
    });

    this.broker.createService({
      mixins: [ProxyService],
      settings: {
        podProvider: true
      }
    });

    this.broker.createService({ mixins: [SignatureService] });

    this.broker.createService({
      mixins: [KeysService],
      settings: {
        actorsKeyPairsDir: path.resolve(baseDir, './actors'),
        podProvider: true
      }
    });

    this.broker.createService({
      mixins: [SparqlEndpointService],
      settings: {
        podProvider: true,
        defaultAccept: 'application/ld+json'
      }
    });

    this.broker.createService({
      mixins: [TripleStoreService],
      settings: {
        ...triplestore
      }
    });

    this.broker.createService({
      mixins: queueServiceUrl ? [ManagementService, QueueService(queueServiceUrl)] : [ManagementService],
      settings: { settingsDataset }
    });

    this.broker.createService({
      mixins: [WebAclService],
      settings: {
        baseUrl,
        podProvider: true
      }
    });

    this.broker.createService({
      mixins: [WebfingerService],
      settings: {
        baseUrl
      }
    });

    this.broker.createService({
      mixins: [SynchronizerService],
      settings: {
        podProvider: true,
        mirrorGraph: false,
        synchronizeContainers: false,
        attachToLocalContainers: true
      }
    });

    this.broker.createService({ mixins: [InstallationService] });

    this.broker.createService({
      mixins: [AppOpenerService],
      settings: {
        frontendUrl
      }
    });

    this.broker.createService({ mixins: [AppStatusService] });

    this.broker.createService({ mixins: [FilesService] });

    this.broker.createService({
      mixins: [JWKService],
      settings: {
        jwtPath: path.resolve(baseDir, './jwt')
      }
    });

    this.broker.createService({
      mixins: [OidcProviderService],
      settings: {
        baseUrl,
        frontendUrl,
        ...oidcProvider
      }
    });

    this.broker.createService({
      mixins: [NotificationProviderService],
      settings: {
        baseUrl,
        queueServiceUrl
      }
    });

    this.broker.createService({ mixins: [TypeIndexesService] });

    this.broker.createService({
      mixins: queueServiceUrl ? [MailNotificationsService, QueueService(queueServiceUrl)] : [MailNotificationsService],
      settings: {
        frontendUrl,
        ...notifications.mail
      }
    });

    this.broker.createService({ mixins: [AnnouncerService] });

    this.broker.createService({
      mixins: [NodeinfoService],
      settings: {
        baseUrl,
        software: {
          name: 'activitypods',
          version: packageDesc.version,
          repository: packageDesc.repository?.url,
          homepage: packageDesc.homepage
        },
        protocols: ['activitypub'],
        metadata: {
          frontend_url: frontendUrl,
          login_url: frontendUrl && urlJoin(frontendUrl, 'login'),
          consent_url: frontendUrl && urlJoin(frontendUrl, 'authorize'),
          signup_url: frontendUrl && urlJoin(frontendUrl, 'login?signup=true'),
          logout_url: frontendUrl && urlJoin(frontendUrl, 'login?logout=true')
        }
      },
      actions: {
        async getUsersCount(ctx) {
          const accounts = await ctx.call('auth.account.find');
          const totalPods = accounts.length;
          return {
            total: totalPods,
            activeHalfYear: totalPods,
            activeMonth: totalPods
          };
        }
      }
    });
  }
};

module.exports = CoreService;
