const path = require('path');
const Redis = require('ioredis');
const { ServiceBroker } = require('moleculer');
const { AuthAccountService } = require('@semapps/auth');
const { CoreService: SemAppsCoreService } = require('@semapps/core');
const { MIME_TYPES } = require('@semapps/mime-types');
const { NodeinfoService } = require('@semapps/nodeinfo');
const { ProxyService } = require('@semapps/crypto');
const { TripleStoreAdapter } = require('@semapps/triplestore');
const { WebAclMiddleware } = require('@semapps/webacl');
const { interop, oidc, notify, apods } = require('@semapps/ontologies');
const { NotificationsListenerService } = require('@semapps/solid');
const RdfJSONSerializer = require('../pod-provider/backend/RdfJSONSerializer');
const { clearMails } = require('./utils');
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

// Delete all data except special endpoints
const clearSettingsDataset = () =>
  fetch(`${CONFIG.SPARQL_ENDPOINT}settings/update`, {
    method: 'POST',
    body: `
      DELETE {
        ?subject ?predicate ?object .
      } WHERE {
        ?subject ?predicate ?object .
        FILTER(STRSTARTS(STR(?subject), "urn:"))
      }
    `,
    headers: {
      'Content-Type': 'application/sparql-update',
      'X-SemappsUser': 'system',
      Authorization: `Basic ${Buffer.from(`${CONFIG.JENA_USER}:${CONFIG.JENA_PASSWORD}`).toString('base64')}`
    }
  });

const clearRedisDb = async redisUrl => {
  const redisClient = new Redis(redisUrl);
  await redisClient.flushdb();
  redisClient.disconnect();
};

const clearAllData = async () => {
  const datasets = await listDatasets();
  for (let dataset of datasets.filter(d => d != 'settings')) {
    await clearDataset(dataset);
  }

  await clearSettingsDataset();

  await clearRedisDb(CONFIG.QUEUE_SERVICE_URL);
  await clearRedisDb(CONFIG.REDIS_OIDC_PROVIDER_URL);

  await clearMails();
};

const connectPodProvider = async () => {
  // Connect to the Pod provider broker with a Redis transporter
  const broker = new ServiceBroker({
    nodeID: `test-node`,
    logger: false,
    transporter: CONFIG.REDIS_TRANSPORTER_URL,
    serializer: new RdfJSONSerializer()
  });

  await broker.start();

  // If the service is available, it means we are connected to the Pod provider broker
  await broker.waitForServices(['ldp']);

  // Reset internal cache (the channels have been deleted, but they are still in a this.channels array)
  await broker.waitForServices(['solid-notifications.provider.webhook']);
  await broker.call('solid-notifications.provider.webhook.resetCache');

  return broker;
};

const initializeAppServer = async (port, mainDataset, settingsDataset, queueServiceDb, appService) => {
  const baseUrl = `http://localhost:${port}/`;
  const queueServiceUrl = `redis://localhost:6379/${queueServiceDb}`;

  await clearRedisDb(queueServiceUrl);

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
    mixins: [NotificationsListenerService],
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

  await actor.call('auth-agent.registerApp', {
    appUri,
    acceptedAccessNeeds,
    acceptedSpecialRights
  });
};

module.exports = {
  listDatasets,
  clearDataset,
  clearRedisDb,
  clearAllData,
  connectPodProvider,
  initializeAppServer,
  getAppAccessNeeds,
  installApp
};
