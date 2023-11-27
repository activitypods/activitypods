const path = require('path');
const { ServiceBroker } = require('moleculer');
const { AuthAccountService } = require('@semapps/auth');
const { delay } = require('@semapps/ldp');
const { NodeinfoService } = require('@semapps/nodeinfo');
const { TripleStoreAdapter } = require('@semapps/triplestore');
const { WebAclMiddleware } = require('@semapps/webacl');
const { ObjectsWatcherMiddleware } = require('@semapps/sync');
const { CoreService, interopContext } = require('@activitypods/core');
const { CoreService: SemAppsCoreService } = require('@semapps/core');
const { AnnouncerService } = require('@activitypods/announcer');
const CONFIG = require('./config');

Error.stackTraceLimit = Infinity;

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

const initialize = async (port, accountsDataset) => {
  const baseUrl = `http://localhost:${port}/`;

  const broker = new ServiceBroker({
    nodeID: 'server' + port,
    middlewares: [
      WebAclMiddleware({ baseUrl, podProvider: true }),
      ObjectsWatcherMiddleware({ baseUrl, podProvider: true })
    ],
    logger: {
      type: 'Console',
      options: {
        level: 'warn'
      }
    }
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
      jsonContext: 'https://activitypods.org/context.json',
      oidcProvider: {
        redisUrl: CONFIG.REDIS_OIDC_PROVIDER_URL
      },
      auth: {
        accountsDataset
      },
      api: {
        port
      }
    }
  });

  await broker.createService(AnnouncerService);

  return broker;
};

const initializeAppServer = async (port, accountsDataset) => {
  const baseUrl = `http://localhost:${port}/`;

  const broker = new ServiceBroker({
    nodeID: 'server' + port,
    middlewares: [WebAclMiddleware({ baseUrl })],
    logger: {
      type: 'Console',
      options: {
        level: 'warn'
      }
    }
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
      jsonContext: 'https://activitypods.org/context.json',
      api: {
        port
      }
    }
  });

  await broker.createService(AuthAccountService, {
    adapter: new TripleStoreAdapter({ type: 'AuthAccount', dataset: accountsDataset })
  });

  await broker.createService(NodeinfoService, {
    settings: {
      baseUrl
    }
  });

  return broker;
};

const installApp = async (actor, appUri, acceptedAccessNeeds, acceptedSpecialRights) => {
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
