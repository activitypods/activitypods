const path = require('path');
const { ServiceBroker } = require('moleculer');
const { WebAclMiddleware } = require('@semapps/webacl');
const { ObjectsWatcherMiddleware } = require('@semapps/sync');
const { CoreService } = require('@activitypods/core');
const { AnnouncerService } = require('@activitypods/announcer');
const CONFIG = require('./config');

Error.stackTraceLimit = Infinity;

const listDatasets = async () => {
  const response = await fetch(CONFIG.SPARQL_ENDPOINT + '$/datasets', {
    headers: {
      Authorization: 'Basic ' + Buffer.from(CONFIG.JENA_USER + ':' + CONFIG.JENA_PASSWORD).toString('base64'),
    },
  });

  if (response.ok) {
    const json = await response.json();
    return json.datasets.map((dataset) => dataset['ds.name'].substring(1));
  } else {
    return [];
  }
};

const clearDataset = (dataset) =>
  fetch(CONFIG.SPARQL_ENDPOINT + dataset + '/update', {
    method: 'POST',
    body: 'update=CLEAR+ALL', // DROP+ALL is not working with WebACL datasets !
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(CONFIG.JENA_USER + ':' + CONFIG.JENA_PASSWORD).toString('base64'),
    },
  });

const initialize = async (port, accountsDataset) => {
  const baseUrl = `http://localhost:${port}/`;

  const broker = new ServiceBroker({
    nodeID: 'server' + port,
    middlewares: [
      WebAclMiddleware({ baseUrl, podProvider: true }),
      ObjectsWatcherMiddleware({ baseUrl, podProvider: true }),
    ],
    logger: {
      type: 'Console',
      options: {
        level: 'warn',
      },
    },
  });

  await broker.createService(CoreService, {
    settings: {
      baseUrl,
      baseDir: path.resolve(__dirname),
      triplestore: {
        url: CONFIG.SPARQL_ENDPOINT,
        user: CONFIG.JENA_USER,
        password: CONFIG.JENA_PASSWORD,
      },
      jsonContext: 'https://activitypods.org/context.json',
      auth: {
        accountsDataset,
      },
      api: {
        port,
      },
    },
  });

  await broker.createService(AnnouncerService);

  return broker;
};

module.exports = {
  listDatasets,
  clearDataset,
  initialize,
};
