const path = require('path');
const { ServiceBroker } = require('moleculer');
const { WebAclMiddleware} = require('@semapps/webacl');
const CONFIG = require('./config');

const clearDataset = dataset => (
  fetch(CONFIG.SPARQL_ENDPOINT + dataset + '/update', {
    method: 'POST',
    body: 'update=CLEAR+ALL', // DROP+ALL is not working with WebACL datasets !
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(CONFIG.JENA_USER + ':' + CONFIG.JENA_PASSWORD).toString('base64')
    }
  })
);

const initialize = async () => {
  const broker = new ServiceBroker({
    middlewares: [WebAclMiddleware({ podProvider: true })],
    logger: {
      type: 'Console',
      options: {
        level: 'error'
      }
    }
  });

  await clearDataset('settings');
  for (let i = 1; i <= 3; i++) {
    const actorData = require(`./data/actor${i}.json`);
    await clearDataset(actorData.username);
  }

  return broker;
};

module.exports = initialize;
