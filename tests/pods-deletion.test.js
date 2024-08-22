const BackupService = require('@semapps/backup');
const fs = require('fs');
const path = require('path');
const urlJoin = require('url-join');
const { initialize, clearDataset, listDatasets } = require('./initialize');
const CONFIG = require('./config');

jest.setTimeout(80_000);

const NUM_PODS = 2;

const initializeBroker = async (port, accountsDataset) => {
  const broker = await initialize(port, accountsDataset);

  broker.createService({
    mixins: [BackupService],
    settings: {
      localServer: {
        fusekiBase: path.resolve(__dirname, CONFIG.FUSEKI_BASE)
      },
      copyMethod: 'fs', // rsync, ftp, or fs
      remoteServer: {
        path: path.join(__dirname, 'backups')
      }
    }
  });

  await broker.start();

  return broker;
};

describe('Delete an actor', () => {
  let actors = [],
    broker,
    alice,
    bob;

  beforeAll(async () => {
    const datasets = await listDatasets();
    for (const dataset of datasets) {
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

    // Create backups.
    await broker.call('backup.backupDatasets');

    alice = actors[1];
    bob = actors[2];
  }, 80_000);

  afterAll(async () => {
    await broker?.stop();
  });

  test('Actor Alice is not allowed to be deleted by Bob.', async () => {
    await expect(bob.call('management.deleteActor', { actorUri: alice.id, iKnowWhatImDoing: true })).rejects.toThrow(
      'Forbidden'
    );
  });

  // This test will fail, if the server does not have write access on the triplestore directory.
  test.skip('Actor Alice is deleted (requires triplestore directory access).', async () => {
    const username = alice['foaf:nick'];
    // Delete Alice
    await alice.call('management.deleteActor', { actorUri: alice.id, iKnowWhatImDoing: true });

    // Check, that account information is limited to deletedAt, username, webId.
    const tombStoneAccount = await broker.call('auth.account.findByUsername', { username });
    expect(tombStoneAccount).toHaveProperty('deletedAt');
    expect(tombStoneAccount.webId).toBe(alice.id || alice['@id']);
    expect(tombStoneAccount.username).toBe(username);
    expect(tombStoneAccount).not.toHaveProperty('email');
    expect(tombStoneAccount).not.toHaveProperty('hashedPassword');

    // When querying all accounts, alice is not present.
    const allAccounts = await broker.call('auth.account.find');
    expect(allAccounts.find(acc => acc.username === username)).toBeFalsy();

    // Check, if uploads are empty.
    expect(fs.existsSync(`./uploads/${username}`)).toBeFalsy();

    // Check, if backups are deleted.
    expect(fs.readdirSync(path.join(CONFIG.FUSEKI_BASE, 'backups')).find(file => file.includes(username))).toBeFalsy();
  }, 80_000);

  test('New user Alice is not able to be created due to the tombstone.', async () => {
    const actorData = require(`./data/actor1.json`);
    await expect(broker.call('auth.signup', actorData)).rejects.toThrow('');
  }, 80_000);

  // We need to skip this test, because dataset deletion is only completed after a fuseki restart.
  // And a fuseki restart has to be done manually.
  test.skip('A new user alice is able to be created after tombstone is removed (requires triplestore directory access + fuseki restart).', async () => {
    const username = alice['foaf:nick'];

    // Delete the dataset here because in normal situations, it is scheduled to be deleted after a delay.
    await broker.call('triplestore.dataset.delete', { dataset: username, iKnowWhatImDoing: true });

    // Delete tombstone information manually here, since it is usually scheduled to be deleted after a year.
    await broker.call('auth.account.deleteByWebId', { webId: alice.id || alice['@id'] });

    // Check, if dataset still exists.
    await expect(broker.call('triplestore.dataset.exist', { dataset: username })).resolves.toBeFalsy();

    // Create alice again.
    const actorData = require(`./data/actor1.json`);
    const { webId } = await broker.call('auth.signup', actorData);

    await expect(
      await broker.call(
        'activitypub.actor.awaitCreateComplete',
        {
          actorUri: webId,
          additionalKeys: ['url']
        },
        { meta: { dataset: actorData.username } }
      )
    ).not.toThrow();
  }, 10_000);

  test('Actor Bob is still available', async () => {
    const username = bob['foaf:nick'];

    // Check, if dataset still exists.
    await expect(broker.call('triplestore.dataset.exist', { dataset: username })).resolves.toBeTruthy();

    // Check, that account information is available.
    const account = await broker.call('auth.account.findByUsername', { username });
    expect(account).toHaveProperty('email');
    expect(account).toHaveProperty('hashedPassword');

    // Check, that uploads are not empty.
    expect(fs.existsSync(path.join('./uploads/', username))).toBeTruthy();

    // Check, that backups are not deleted.
    expect(
      fs.readdirSync(path.resolve(__dirname, CONFIG.FUSEKI_BASE, 'backups')).find(file => file.includes(username))
    ).toBeTruthy();
  }, 10_000);
});
