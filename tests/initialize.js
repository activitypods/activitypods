const { ServiceBroker } = require('moleculer');
const { WebAclMiddleware } = require('@semapps/webacl');
const CONFIG = require('./config');

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

const initialize = async () => {
  const broker = new ServiceBroker({
    middlewares: [WebAclMiddleware({ baseUrl: CONFIG.HOME_URL, podProvider: true })],
    logger: {
      type: 'Console',
      options: {
        level: 'error',
      },
    },
  });

  const datasets = await listDatasets();
  for (let dataset of datasets) {
    await clearDataset(dataset);
  }

  return broker;
};

module.exports = initialize;
