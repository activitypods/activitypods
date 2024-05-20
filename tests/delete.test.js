const fs = require('fs');
const urlJoin = require('url-join');
const { initialize, clearDataset, listDatasets } = require('./initialize');

jest.setTimeout(80000);

const NUM_PODS = 2;

const initializeBroker = async (port, accountsDataset) => {
  const broker = await initialize(port, accountsDataset);

  await broker.start();

  return broker;
};

describe('Delete an actor', () => {
  let actors = [],
    broker,
    alice,
    projectUri;

  beforeAll(async () => {
    const datasets = await listDatasets();
    for (let dataset of datasets) {
      await clearDataset(dataset);
    }

    broker = await initializeBroker(3000, 'settings');

    for (let i = 1; i <= NUM_PODS; i++) {
      broker[i] = broker;

      const actorData = require(`./data/actor${i}.json`);
      const { webId, token } = await broker[i].call('auth.signup', actorData);
      actors[i] = await broker[i].call(
        'activitypub.actor.awaitCreateComplete',
        {
          actorUri: webId,
          additionalKeys: ['url']
        },
        { meta: { dataset: actorData.username } }
      );
      actors[i].token = token;
      actors[i].call = (actionName, params, options = {}) =>
        broker[i].call(actionName, params, {
          ...options,
          meta: { ...options.meta, webId, dataset: actors[i].preferredUsername }
        });

      await fetch(urlJoin(webId, 'data'), {
        headers: {
          'content-type': 'text/plain',
          authorization: `Bearer ${token}`
        },
        method: 'POST',
        body: 'This is just a plain non-rdf file.'
      });
    }

    alice = actors[1];
    bob = actors[2];
  }, 80000);

  afterAll(async () => {
    await broker?.stop();
  });

  test('Actor Alice is not allowed to be deleted by Bob.', async () => {
    await expect(bob.call('management.deleteActor', { actorSlug: 'alice', iKnowWhatImDoing: true })).rejects.toThrow(
      'Forbidden'
    );
  });

  test('Actor Alice is deleted', async () => {
    const username = alice['foaf:nick'];
    // Delete Alice
    await alice.call('management.deleteActor', { actorSlug: username, iKnowWhatImDoing: true });

    // Check, if dataset still exists.
    await expect(broker.call('triplestore.dataset.exist', { dataset: username })).resolves.toBeFalsy();

    // Check, that account information is limited to deletedAt, username, webId.
    const tombStoneAccount = await broker.call('auth.account.findByUsername', { username });
    expect(tombStoneAccount).toHaveProperty('deletedAt');
    expect(tombStoneAccount.webId).toBe(alice.id || alice['@id']);
    expect(tombStoneAccount.username).toBe(username);
    expect(tombStoneAccount).not.toHaveProperty('email');
    expect(tombStoneAccount).not.toHaveProperty('hashedPassword');

    // Check, if uploads are empty.
    expect(fs.existsSync('./uploads/' + username)).toBeFalsy();

    // Check, if backups are deleted.
  }, 80000);

  test('Actor Bob is still available', async () => {
    const username = bob['foaf:nick'];

    // Check, if dataset still exists.
    await expect(broker.call('triplestore.dataset.exist', { dataset: username })).resolves.toBeTruthy();

    // Check, that account information is available.
    const account = await broker.call('auth.account.findByUsername', { username });
    expect(account).toHaveProperty('email');
    expect(account).toHaveProperty('hashedPassword');

    // Check, that uploads are not empty.
    expect(fs.existsSync('./uploads/' + username)).toBeTruthy();

    // Check, that backups are not deleted.
  }, 80000);
});
