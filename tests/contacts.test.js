const waitForExpect = require('wait-for-expect');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');
const { initialize, clearDataset, listDatasets } = require('./initialize');
const path = require('path');
const urlJoin = require('url-join');

jest.setTimeout(80000);

const NUM_PODS = 3;

const mockSendNotification = jest.fn(() => Promise.resolve());

const initializeBroker = async (port, accountsDataset) => {
  const broker = await initialize(port, accountsDataset);

  await broker.loadService(path.resolve(__dirname, './services/profiles.app.js'));
  await broker.loadService(path.resolve(__dirname, './services/contacts.app.js'));

  // Mock notification service
  await broker.createService({
    mixins: [require('./services/notification.service')],
    actions: {
      send: mockSendNotification,
    },
  });

  await broker.start();

  return broker;
}

describe.each(['single-server', 'multi-server'])('In mode %s, test contacts app', mode => {
  let actors = [],
    broker,
    alice,
    bob,
    craig,
    contactRequestToBob,
    contactRequestToCraig;

  beforeAll(async () => {
    const datasets = await listDatasets();
    for (let dataset of datasets) {
      await clearDataset(dataset);
    }

    mockSendNotification.mockReset();

    if (mode === 'single-server') {
      broker = await initializeBroker(3000, 'settings');
    } else {
      broker = [];
    }

    for (let i = 1; i <= NUM_PODS; i++) {
      if (mode === 'multi-server') {
        broker[i] = await initializeBroker(3000 + i, 'settings' + i);
      } else {
        broker[i] = broker;
      }

      const actorData = require(`./data/actor${i}.json`);
      const { webId } = await broker[i].call('auth.signup', actorData);
      actors[i] = await broker[i].call('activitypub.actor.awaitCreateComplete', {
        actorUri: webId,
        additionalKeys: ['url', 'apods:contacts', 'apods:contactRequests', 'apods:rejectedContacts'],
      }, { meta: { dataset: actorData.username }});
      actors[i].call = (actionName, params, options = {}) => broker[i].call(actionName, params, { ...options, meta: { ...options.meta, webId, dataset: actors[i].preferredUsername }});
    }

    alice = actors[1];
    bob = actors[2];
    craig = actors[3];
  }, 80001);

  afterAll(async () => {
    if (mode === 'multi-server') {
      for (let i = 1; i <= NUM_PODS; i++) {
        await broker[i].stop();
      }
    } else {
      await broker.stop();
    }
  });

  test('Alice offers her contact to Bob and Craig', async () => {
    contactRequestToBob = await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.OFFER,
      actor: alice.id,
      object: {
        type: ACTIVITY_TYPES.ADD,
        object: alice.url,
      },
      content: 'Salut Bob, tu te rappelles de moi ?',
      target: bob.id,
      to: bob.id,
    });

    await waitForExpect(() => {
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
    });

    expect(mockSendNotification.mock.calls[0][0].params.data.key).toBe('contact_request');

    await waitForExpect(async () => {
      await expect(
        alice.call('webacl.resource.hasRights', {
          resourceUri: alice.url,
          rights: { read: true },
          webId: bob.id,
        })
      ).resolves.toMatchObject({ read: true });
    });

    await waitForExpect(async () => {
      await expect(
        bob.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contactRequests'],
          itemUri: contactRequestToBob.id,
        })
      ).resolves.toBeTruthy();
    });

    contactRequestToCraig = await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.OFFER,
      actor: alice.id,
      object: {
        type: ACTIVITY_TYPES.ADD,
        object: alice.url,
      },
      content: 'Salut Craig, ça fait longtemps !',
      target: craig.id,
      to: craig.id,
    });

    await waitForExpect(async () => {
      await expect(
        bob.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contactRequests'],
          itemUri: contactRequestToCraig.id,
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(() => {
      expect(mockSendNotification).toHaveBeenCalledTimes(2);
    });

    expect(mockSendNotification.mock.calls[1][0].params.data.key).toBe('contact_request');
  }, 80000);

  test('Bob accept Alice contact request', async () => {
    await bob.call('activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: ACTIVITY_TYPES.ACCEPT,
      actor: bob.id,
      object: contactRequestToBob.id,
      to: alice.id,
    });

    await waitForExpect(async () => {
      await expect(
        bob.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contactRequests'],
          itemUri: contactRequestToBob.id,
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      await expect(
        bob.call('activitypub.collection.includes', { collectionUri: bob['apods:contacts'], itemUri: alice.id })
      ).resolves.toBeTruthy();
    });

    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', { collectionUri: alice['apods:contacts'], itemUri: bob.id })
      ).resolves.toBeTruthy();
    });

    // Bob profile is cached in Alice dataset
    await waitForExpect(async () => {
      await expect(
        alice.call('triplestore.countTriplesOfSubject', {
          uri: alice.url,
          dataset: bob.preferredUsername,
          webId: 'system',
        })
      ).resolves.toBeTruthy();
    });

    // Bob profile is attached to Alice /profiles container
    await waitForExpect(async () => {
      await expect(
        alice.call('ldp.container.includes', {
          containerUri: urlJoin(alice.id, 'data', 'profiles'),
          resourceUri: bob.url,
          webId: alice.id
        })
      ).resolves.toBeTruthy();
    });

    // Alice profile is cached in Bob dataset
    await waitForExpect(async () => {
      await expect(
        bob.call('triplestore.countTriplesOfSubject', {
          uri: bob.url,
          dataset: alice.preferredUsername,
          webId: 'system',
        })
      ).resolves.toBeTruthy();
    });

    // Alice profile is attached to Bob /profiles container
    await waitForExpect(async () => {
      await expect(
        bob.call('ldp.container.includes', {
          containerUri: urlJoin(bob.id, 'data', 'profiles'),
          resourceUri: alice.url,
          webId: bob.id
        })
      ).resolves.toBeTruthy();
    });

    await waitForExpect(() => {
      expect(mockSendNotification).toHaveBeenCalledTimes(3);
    });

    expect(mockSendNotification.mock.calls[2][0].params.data.key).toBe('accept_contact_request');
  }, 80000);

  test('Craig reject Alice contact request', async () => {
    await craig.call('activitypub.outbox.post', {
      collectionUri: craig.outbox,
      type: ACTIVITY_TYPES.REJECT,
      actor: craig.id,
      object: contactRequestToCraig.id,
      to: alice.id,
    });

    await waitForExpect(async () => {
      await expect(
        craig.call('activitypub.collection.includes', {
          collectionUri: craig['apods:contactRequests'],
          itemUri: contactRequestToCraig.id,
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      await expect(
        craig.call('activitypub.collection.includes', {
          collectionUri: craig['apods:rejectedContacts'],
          itemUri: alice.id,
        })
      ).resolves.toBeTruthy();
    });
  });

  test('Bob removes Alice from his contacts', async () => {
    await bob.call('activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: ACTIVITY_TYPES.REMOVE,
      actor: bob.id,
      object: alice.id,
      origin: bob['apods:contacts']
    });

    await waitForExpect(async () => {
      await expect(
        bob.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contacts'],
          itemUri: alice.id,
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      await expect(
        bob.call('ldp.container.includes', {
          containerUri: urlJoin(bob.id, 'data', 'profiles'),
          resourceUri: alice.url,
        })
      ).resolves.toBeFalsy();
    });
  });
});
