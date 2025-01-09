const fs = require('fs');
const path = require('path');
const urlJoin = require('url-join');
const { connectPodProvider, clearAllData } = require('./initialize');

jest.setTimeout(80_000);

const NUM_PODS = 2;

describe('Delete an actor', () => {
  let actors = [],
    podProvider,
    alice,
    bob;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    for (let i = 1; i <= NUM_PODS; i++) {
      const actorData = require(`./data/actor${i}.json`);
      const { webId, token } = await podProvider.call('auth.signup', actorData);
      actors[i] = await podProvider.call(
        'activitypub.actor.awaitCreateComplete',
        {
          actorUri: webId,
          additionalKeys: ['url']
        },
        { meta: { dataset: actorData.username } }
      );
      actors[i].token = token;
      actors[i].call = (actionName, params, options = {}) =>
        podProvider.call(actionName, params, {
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
    // await broker.call('backup.backupDatasets');

    alice = actors[1];
    bob = actors[2];
  }, 80_000);

  afterAll(async () => {
    await podProvider.stop();
  });

  test('Actor Alice is not allowed to be deleted by Bob.', async () => {
    await expect(alice.call('management.deleteAccount', { username: 'bob' })).rejects.toThrow('Forbidden');
  });

  // This test will fail, if the server does not have write access on the triplestore directory.
  test.skip('Actor Alice is deleted (requires triplestore directory access).', async () => {
    const username = alice['foaf:nick'];
    // Delete Alice
    await alice.call('management.deleteAccount', { username: 'alice' });

    // Check, that account information is limited to deletedAt, username, webId.
    const tombStoneAccount = await podProvider.call('auth.account.findByUsername', { username });
    expect(tombStoneAccount).toHaveProperty('deletedAt');
    expect(tombStoneAccount.webId).toBe(alice.id || alice['@id']);
    expect(tombStoneAccount.username).toBe(username);
    expect(tombStoneAccount).not.toHaveProperty('email');
    expect(tombStoneAccount).not.toHaveProperty('hashedPassword');

    // When querying all accounts, alice is not present.
    const allAccounts = await podProvider.call('auth.account.find');
    expect(allAccounts.find(acc => acc.username === username)).toBeFalsy();

    // Check, if uploads are empty.
    expect(fs.existsSync(`./uploads/${username}`)).toBeFalsy();

    // Check, if backups are deleted.
    // expect(fs.readdirSync(path.join(CONFIG.FUSEKI_BASE, 'backups')).find(file => file.includes(username))).toBeFalsy();
  }, 80_000);

  test('New user Alice is not able to be created due to the tombstone.', async () => {
    const actorData = require(`./data/actor1.json`);
    await expect(podProvider.call('auth.signup', actorData)).rejects.toThrow('');
  }, 80_000);

  // We need to skip this test, because dataset deletion is only completed after a fuseki restart.
  // And a fuseki restart has to be done manually.
  test.skip('A new user alice is able to be created after tombstone is removed (requires triplestore directory access + fuseki restart).', async () => {
    const username = alice['foaf:nick'];

    // Delete the dataset here because in normal situations, it is scheduled to be deleted after a delay.
    await podProvider.call('triplestore.dataset.delete', { dataset: username, iKnowWhatImDoing: true });

    // Delete tombstone information manually here, since it is usually scheduled to be deleted after a year.
    await podProvider.call('auth.account.deleteByWebId', { webId: alice.id || alice['@id'] });

    // Check, if dataset still exists.
    await expect(podProvider.call('triplestore.dataset.exist', { dataset: username })).resolves.toBeFalsy();

    // Create alice again.
    const actorData = require(`./data/actor1.json`);
    const { webId } = await podProvider.call('auth.signup', actorData);

    await expect(
      await podProvider.call(
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
    await expect(podProvider.call('triplestore.dataset.exist', { dataset: username })).resolves.toBeTruthy();

    // Check, that account information is available.
    const account = await podProvider.call('auth.account.findByUsername', { username });
    expect(account).toHaveProperty('email');
    expect(account).toHaveProperty('hashedPassword');

    // Check, that uploads are not empty.
    expect(fs.existsSync(path.join('./uploads/', username))).toBeTruthy();

    // Check, that backups are not deleted.
    // expect(
    //   fs.readdirSync(path.resolve(__dirname, CONFIG.FUSEKI_BASE, 'backups')).find(file => file.includes(username))
    // ).toBeTruthy();
  }, 10_000);
});
