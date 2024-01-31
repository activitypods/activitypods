const path = require('path');
const urlJoin = require('url-join');
const { ActivityPubService, ActivityMappingService, ACTOR_TYPES, OBJECT_TYPES } = require('@semapps/activitypub');
const { AuthLocalService, AuthOIDCService } = require('@semapps/auth');
const { JsonLdService } = require('@semapps/jsonld');
const { LdpService, DocumentTaggerMixin } = require('@semapps/ldp');
const { OntologiesService, dc, syreen, mp, pair, void: voidOntology } = require('@semapps/ontologies');
const { PodService } = require('@semapps/pod');
const { NodeinfoService } = require('@semapps/nodeinfo');
const { SignatureService, ProxyService } = require('@semapps/signature');
const { SynchronizerService } = require('@semapps/sync');
const { SparqlEndpointService } = require('@semapps/sparql-endpoint');
const { TripleStoreService } = require('@semapps/triplestore');
const { WebAclService } = require('@semapps/webacl');
const { WebfingerService } = require('@semapps/webfinger');
const { WebIdService } = require('@semapps/webid');
const { NotificationProviderService } = require('@activitypods/solid-notifications');
const { apods, interop, notify, oidc } = require('@activitypods/ontologies');
const ApiService = require('./services/api');
const AppOpenerService = require('./services/app-opener');
const FilesService = require('./services/files');
const InstallationService = require('./services/installation');
const JWKService = require('./services/jwk');
const OidcProviderService = require('./services/oidc-provider/oidc-provider');
const packageDesc = require('./package.json');

const CoreService = {
  name: 'core',
  settings: {
    baseUrl: null,
    baseDir: null,
    frontendUrl: null,
    triplestore: {
      url: null,
      user: null,
      password: null
    },
    settingsDataset: 'settings',
    queueServiceUrl: null,
    redisOidcProviderUrl: null,
    authType: 'local',
    oidcProvider: {
      redisUrl: null,
      cookieSecret: 'COOKIE-SECRET'
    }
  },
  created() {
    let { baseUrl, baseDir, frontendUrl, triplestore, settingsDataset, queueServiceUrl, oidcProvider, authType } =
      this.settings;

    this.broker.createService(ActivityPubService, {
      settings: {
        baseUri: baseUrl,
        podProvider: true,
        dispatch: {
          queueServiceUrl
        },
        like: {
          attachToObjectTypes: [...Object.values(OBJECT_TYPES), 'pair:Skill'],
          attachToActorTypes: Object.values(ACTOR_TYPES)
        }
      }
    });

    this.broker.createService(ApiService, {
      settings: {
        ...this.settings.api,
        frontendUrl
      }
    });

    this.broker.createService(authType === 'local' ? AuthLocalService : AuthOIDCService, {
      settings: {
        baseUrl,
        jwtPath: path.resolve(baseDir, './jwt'),
        reservedUsernames: ['sparql', 'auth', 'common', 'data', 'settings', 'localData', 'testData'],
        webIdSelection: ['nick'],
        accountSelection: ['preferredLocale'],
        formUrl: frontendUrl ? urlJoin(frontendUrl, 'login') : undefined,
        accountsDataset: settingsDataset,
        podProvider: true,
        ...this.settings.auth
      }
    });

    this.broker.createService(JsonLdService, {
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

    this.broker.createService(OntologiesService, {
      settings: {
        ontologies: [apods, interop, notify, oidc, dc, syreen, mp, pair, voidOntology],
        persistRegistry: false,
        settingsDataset
      }
    });

    this.broker.createService(LdpService, {
      mixins: [DocumentTaggerMixin],
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

    this.broker.createService(PodService, {
      settings: {
        baseUrl
      }
    });

    // Required for notifications
    this.broker.createService(ActivityMappingService, {
      settings: {
        handlebars: {
          helpers: {
            encodeUri: uri => encodeURIComponent(uri)
          }
        }
      }
    });

    this.broker.createService(ProxyService, {
      settings: {
        podProvider: true
      }
    });

    this.broker.createService(SignatureService, {
      settings: {
        actorsKeyPairsDir: path.resolve(baseDir, './actors')
      }
    });

    this.broker.createService(SparqlEndpointService, {
      settings: {
        podProvider: true,
        defaultAccept: 'application/ld+json'
      }
    });

    this.broker.createService(TripleStoreService, {
      settings: {
        url: triplestore.url,
        user: triplestore.user,
        password: triplestore.password
      }
    });

    this.broker.createService(WebAclService, {
      settings: {
        baseUrl,
        podProvider: true
      }
    });

    this.broker.createService(WebfingerService, {
      settings: {
        baseUrl
      }
    });

    this.broker.createService(WebIdService, {
      settings: {
        baseUrl,
        podProvider: true
      },
      hooks: {
        before: {
          async create(ctx) {
            const { nick } = ctx.params;
            await ctx.call('pod.create', { username: nick });
          }
        }
      }
    });

    this.broker.createService(SynchronizerService, {
      settings: {
        podProvider: true,
        mirrorGraph: false,
        synchronizeContainers: false,
        attachToLocalContainers: true
      }
    });

    this.broker.createService(InstallationService);

    this.broker.createService(AppOpenerService, {
      settings: {
        frontendUrl
      }
    });

    this.broker.createService(FilesService);

    this.broker.createService(JWKService, {
      settings: {
        jwtPath: path.resolve(baseDir, './jwt')
      }
    });

    this.broker.createService(OidcProviderService, {
      settings: {
        baseUrl,
        frontendUrl,
        ...oidcProvider
      }
    });

    this.broker.createService(NotificationProviderService, {
      settings: {
        baseUrl,
        queueServiceUrl
      }
    });

    this.broker.createService(NodeinfoService, {
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
          signup_url: frontendUrl && urlJoin(frontendUrl, 'login?signup=true'),
          logout_url: frontendUrl && urlJoin(frontendUrl, 'login?logout=true'),
          resource_url: frontendUrl && urlJoin(frontendUrl, 'r')
        }
      },
      actions: {
        async getUsersCount(ctx) {
          const pods = await ctx.call('pod.list');
          const totalPods = pods.length;
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
