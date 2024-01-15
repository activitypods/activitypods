const path = require('path');
const { ServiceBroker } = require('moleculer');
const { AuthAccountService } = require('@semapps/auth');
const { delay } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { NodeinfoService } = require('@semapps/nodeinfo');
const { ProxyService } = require('@semapps/signature');
const { TripleStoreAdapter } = require('@semapps/triplestore');
const { apods, interop, oidc } = require('@semapps/ontologies');
const { WebAclMiddleware } = require('@semapps/webacl');
const { ObjectsWatcherMiddleware } = require('@semapps/sync');
const { CoreService, interopContext } = require('@activitypods/core');
const { NotificationListenerService } = require('@activitypods/notification');
const { CoreService: SemAppsCoreService } = require('@semapps/core');
const { AnnouncerService } = require('@activitypods/announcer');
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
  const response = await fetch(CONFIG.SPARQL_ENDPOINT + '$/datasets', {
    headers: {
      Authorization: 'Basic ' + Buffer.from(CONFIG.JENA_USER + ':' + CONFIG.JENA_PASSWORD).toString('base64')
    }
  });

  if (response.ok) {
    const json = await response.json();
    return json.datasets.map(dataset => dataset['ds.name'].substring(1));
  } else {
    return [];
  }
};

const clearDataset = dataset =>
  fetch(CONFIG.SPARQL_ENDPOINT + dataset + '/update', {
    method: 'POST',
    body: 'update=CLEAR+ALL', // DROP+ALL is not working with WebACL datasets !
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(CONFIG.JENA_USER + ':' + CONFIG.JENA_PASSWORD).toString('base64')
    }
  });

const initialize = async (port, settingsDataset) => {
  const baseUrl = `http://localhost:${port}/`;

  const broker = new ServiceBroker({
    nodeID: 'server' + port,
    middlewares: [
      // Uncomment the next line run all tests with memory cacher
      // CacherMiddleware({ type: 'Memory' }),
      WebAclMiddleware({ baseUrl, podProvider: true }),
      ObjectsWatcherMiddleware({ baseUrl, podProvider: true })
    ],
    logger
  });

  await broker.createService(CoreService, {
    settings: {
      baseUrl,
      baseDir: path.resolve(__dirname),
      triplestore: {
        url: CONFIG.SPARQL_ENDPOINT,
        user: CONFIG.JENA_USER,
        password: CONFIG.JENA_PASSWORD
      },
      queueServiceUrl: CONFIG.QUEUE_SERVICE_URL,
      oidcProvider: {
        redisUrl: CONFIG.REDIS_OIDC_PROVIDER_URL
      },
      auth: {
        accountsDataset: settingsDataset
      },
      settingsDataset,
      api: {
        port
      }
    }
  });

  await broker.createService(AnnouncerService);

  return broker;
};

const initializeAppServer = async (port, settingsDataset) => {
  const baseUrl = `http://localhost:${port}/`;

  const broker = new ServiceBroker({
    nodeID: 'server' + port,
    middlewares: [WebAclMiddleware({ baseUrl })],
    logger
  });

  await broker.createService(SemAppsCoreService, {
    settings: {
      baseUrl,
      baseDir: path.resolve(__dirname),
      triplestore: {
        url: CONFIG.SPARQL_ENDPOINT,
        user: CONFIG.JENA_USER,
        password: CONFIG.JENA_PASSWORD,
        mainDataset: 'testData'
      },
      ontologies: [interop, oidc, apods],
      api: {
        port
      },
      ldp: {
        resourcesWithContainerPath: false
      },
      void: false
    }
  });

  await broker.createService(AuthAccountService, {
    adapter: new TripleStoreAdapter({ type: 'AuthAccount', dataset: settingsDataset })
  });

  await broker.createService(NodeinfoService, {
    settings: {
      baseUrl
    }
  });

  await broker.createService(NotificationListenerService, {
    settings: {
      baseUrl
    }
  });

  await broker.createService(ProxyService);

  return broker;
};

const getAppAccessNeeds = async (actor, appUri) => {
  const app = await actor.call('ldp.resource.get', {
    resourceUri: appUri,
    jsonContext: interopContext,
    accept: MIME_TYPES.JSON
  });

  let accessNeedGroup;
  for (const accessNeedUri of app['interop:hasAccessNeedGroup']) {
    accessNeedGroup = await actor.call('ldp.resource.get', {
      resourceUri: accessNeedUri,
      jsonContext: interopContext,
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
    '@context': ['https://www.w3.org/ns/activitystreams', interopContext],
    type: 'apods:Install',
    object: appUri,
    'apods:acceptedAccessNeeds': acceptedAccessNeeds,
    'apods:acceptedSpecialRights': acceptedSpecialRights
  });

  do {
    const outbox = await actor.call('activitypub.collection.get', {
      collectionUri: actor.outbox,
      page: 1
    });

    const firstItem = outbox?.orderedItems[0];

    if (firstItem.type === 'Create' && firstItem.to === appUri) {
      return [firstItem.id, firstItem.object];
    } else {
      await delay(500);
    }
  } while (true);
};

module.exports = {
  listDatasets,
  clearDataset,
  initialize,
  initializeAppServer,
  installApp
};
