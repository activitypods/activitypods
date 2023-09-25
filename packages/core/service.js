const path = require('path');
const urlJoin = require('url-join');
const { ActivityPubService, ActivityMappingService, ACTOR_TYPES, OBJECT_TYPES } = require('@semapps/activitypub');
const { AuthLocalService, AuthOIDCService } = require('@semapps/auth');
const { JsonLdService } = require('@semapps/jsonld');
const { LdpService, DocumentTaggerMixin } = require('@semapps/ldp');
const {
  OntologiesService,
  apods,
  interop,
  oidc,
  dc,
  syreen,
  mp,
  pair,
  void: voidOntology
} = require('@semapps/ontologies');
const { PodService } = require('@semapps/pod');
const { SignatureService, ProxyService } = require('@semapps/signature');
const { SynchronizerService } = require('@semapps/sync');
const { SparqlEndpointService } = require('@semapps/sparql-endpoint');
const { TripleStoreService } = require('@semapps/triplestore');
const { WebAclService } = require('@semapps/webacl');
const { WebfingerService } = require('@semapps/webfinger');
const { WebIdService } = require('@semapps/webid');
const ApiService = require('./services/api');
const FrontAppsService = require('./services/front-apps');
const CapabilitiesService = require('./services/capabilities');
const containers = require('./config/containers');

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
    ontologies: [],
    settingsDataset: 'settings',
    queueServiceUrl: null,
    authType: 'local'
  },
  created() {
    let { baseUrl, baseDir, frontendUrl, triplestore, ontologies, settingsDataset, queueServiceUrl, authType } =
      this.settings;

    this.broker.createService(ActivityPubService, {
      settings: {
        baseUri: baseUrl,
        containers,
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
        ontologies: [...ontologies, apods, interop, oidc, dc, syreen, mp, pair, voidOntology],
        persistRegistry: false,
        settingsDataset
      }
    });

    this.broker.createService(LdpService, {
      mixins: [DocumentTaggerMixin],
      settings: {
        baseUrl,
        ontologies,
        podProvider: true,
        containers,
        resourcesWithContainerPath: true, // TODO try to set to false
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

    this.broker.createService(FrontAppsService, {
      settings: {
        baseUrl,
        frontendUrl,
        ontologies
      }
    });

    this.broker.createService(CapabilitiesService, {
      settings: { path: '/capabilities' }
    });
  }
};

module.exports = CoreService;
