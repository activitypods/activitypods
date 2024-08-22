const path = require('path');
const Redis = require('ioredis');
const { ServiceBroker } = require('moleculer');
const { AuthAccountService } = require('@semapps/auth');
const { CoreService: SemAppsCoreService } = require('@semapps/core');
const { delay } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { NodeinfoService } = require('@semapps/nodeinfo');
const { ProxyService } = require('@semapps/crypto');
const { TripleStoreAdapter } = require('@semapps/triplestore');
const { WebAclMiddleware } = require('@semapps/webacl');
const { ObjectsWatcherMiddleware } = require('@semapps/sync');
const { CoreService, AppControlMiddleware } = require('@activitypods/core');
const { apods, interop, oidc, notify } = require('@activitypods/ontologies');
const { NotificationListenerService } = require('@activitypods/solid-notifications');
const { AnnouncerService } = require('@activitypods/announcer');
const { ProfilesApp } = require('@activitypods/profiles');
const CONFIG = require('./config');

Error.stackTraceLimit = Infinity;

const logger = {
  type: 'Console',
  options: {
    level: 'warn',
    // filename: 'moleculer-{date}-{nodeID}.txt',
    formatter: 'simple'
  }
};

const listDatasets = async () => {
  const response = await fetch(`${CONFIG.SPARQL_ENDPOINT}$/datasets`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${CONFIG.JENA_USER}:${CONFIG.JENA_PASSWORD}`).toString('base64')}`
    }
  });

  if (response.ok) {
    const json = await response.json();
    return json.datasets.map(dataset => dataset['ds.name'].substring(1));
  }
  return [];
};

const clearDataset = dataset =>
  fetch(`${CONFIG.SPARQL_ENDPOINT + dataset}/update`, {
    method: 'POST',
    body: 'update=CLEAR+ALL', // DROP+ALL is not working with WebACL datasets !
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${CONFIG.JENA_USER}:${CONFIG.JENA_PASSWORD}`).toString('base64')}`
    }
  });

const clearQueue = async redisUrl => {
  const redisClient = new Redis(redisUrl);
  await redisClient.flushdb();
  redisClient.disconnect();
};

const initialize = async (port, settingsDataset, queueServiceDb = 0) => {
  const baseUrl = `http://localhost:${port}/`;
  const queueServiceUrl = `redis://localhost:6379/${queueServiceDb}`;

  await clearQueue(queueServiceUrl);

  const broker = new ServiceBroker({
    nodeID: `server${port}`,
    middlewares: [
      // Uncomment the next line run all tests with memory cacher
      // CacherMiddleware({ type: 'Memory' }),
      WebAclMiddleware({ baseUrl, podProvider: true }),
      ObjectsWatcherMiddleware({ baseUrl, podProvider: true, postWithoutRecipients: true }),
      AppControlMiddleware({ baseUrl })
    ],
    logger
  });

  broker.createService({
    mixins: [CoreService],
    settings: {
      baseUrl,
      baseDir: path.resolve(__dirname),
      frontendUrl: 'https://example.app/',
      triplestore: {
        url: CONFIG.SPARQL_ENDPOINT,
        user: CONFIG.JENA_USER,
        password: CONFIG.JENA_PASSWORD,
        fusekiBase: CONFIG.FUSEKI_BASE
      },
      queueServiceUrl,
      oidcProvider: {
        redisUrl: CONFIG.REDIS_OIDC_PROVIDER_URL
      },
      auth: {
        accountsDataset: settingsDataset
      },
      settingsDataset,
      notifications: {
        mail: {
          from: `${CONFIG.FROM_NAME} <${CONFIG.FROM_EMAIL}>`,
          transport: {
            host: CONFIG.SMTP_HOST,
            port: CONFIG.SMTP_PORT,
            secure: CONFIG.SMTP_SECURE,
            auth: {
              user: CONFIG.SMTP_USER,
              pass: CONFIG.SMTP_PASS
            }
          }
        }
      },
      api: {
        port
      }
    }
  });

  broker.createService({ mixins: [AnnouncerService] });

  broker.createService({ mixins: [ProfilesApp] });

  return broker;
};

const initializeAppServer = async (port, mainDataset, settingsDataset, queueServiceDb, appService) => {
  const baseUrl = `http://localhost:${port}/`;
  const queueServiceUrl = `redis://localhost:6379/${queueServiceDb}`;

  await clearQueue(queueServiceUrl);

  const broker = new ServiceBroker({
    nodeID: `server${port}`,
    middlewares: [WebAclMiddleware({ baseUrl })],
    logger
  });

  broker.createService({
    mixins: [SemAppsCoreService],
    settings: {
      baseUrl,
      baseDir: path.resolve(__dirname),
      triplestore: {
        url: CONFIG.SPARQL_ENDPOINT,
        user: CONFIG.JENA_USER,
        password: CONFIG.JENA_PASSWORD,
        fusekiBase: CONFIG.FUSEKI_BASE,
        mainDataset
      },
      ontologies: [interop, oidc, apods, notify],
      activitypub: {
        queueServiceUrl
      },
      api: {
        port
      },
      ldp: {
        resourcesWithContainerPath: false
      },
      void: false,
      webid: false
    }
  });

  broker.createService({
    mixins: [AuthAccountService],
    adapter: new TripleStoreAdapter({ type: 'AuthAccount', dataset: settingsDataset })
  });

  broker.createService({
    mixins: [NodeinfoService],
    settings: {
      baseUrl
    }
  });

  broker.createService({
    mixins: [NotificationListenerService],
    adapter: new TripleStoreAdapter({ type: 'WebhookChannelListener', dataset: settingsDataset }),
    settings: {
      baseUrl
    }
  });

  broker.createService({ mixins: [ProxyService] });

  broker.createService({ mixins: [appService], settings: { queueServiceUrl } });

  return broker;
};

const getAppAccessNeeds = async (actor, appUri) => {
  const app = await actor.call('ldp.resource.get', {
    resourceUri: appUri,
    accept: MIME_TYPES.JSON
  });

  let accessNeedGroup;
  for (const accessNeedUri of app['interop:hasAccessNeedGroup']) {
    accessNeedGroup = await actor.call('ldp.resource.get', {
      resourceUri: accessNeedUri,
      accept: MIME_TYPES.JSON
    });
    if (accessNeedGroup['interop:accessNecessity'] === 'interop:AccessRequired') {
      requiredAccessNeedGroup = accessNeedGroup;
    } else {
      optionalAccessNeedGroup = accessNeedGroup;
    }
  }

  return [requiredAccessNeedGroup, optionalAccessNeedGroup];
};

const installApp = async (actor, appUri, acceptedAccessNeeds, acceptedSpecialRights) => {
  // If the accepted needs are not specified, use the app required access needs
  if (!acceptedAccessNeeds && !acceptedSpecialRights) {
    const [requiredAccessNeedGroup] = await getAppAccessNeeds(actor, appUri);
    acceptedAccessNeeds = requiredAccessNeedGroup['interop:hasAccessNeed'];
    acceptedSpecialRights = requiredAccessNeedGroup['apods:hasSpecialRights'];
  }

  await actor.call('activitypub.outbox.post', {
    collectionUri: actor.outbox,
    type: 'apods:Install',
    object: appUri,
    'apods:acceptedAccessNeeds': acceptedAccessNeeds,
    'apods:acceptedSpecialRights': acceptedSpecialRights
  });

  do {
    const outbox = await actor.call('activitypub.collection.get', {
      resourceUri: actor.outbox,
      page: 1
    });

    const firstItem = outbox?.orderedItems[0];

    if (firstItem.type === 'Create' && firstItem.to === appUri) {
      return [firstItem.id, firstItem.object];
    }
    await delay(500);
  } while (true);
};

module.exports = {
  listDatasets,
  clearDataset,
  initialize,
  initializeAppServer,
  getAppAccessNeeds,
  installApp
};
