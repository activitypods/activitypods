const urlJoin = require('url-join');
const waitForExpect = require('wait-for-expect');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');
const { arrayOf } = require('@semapps/ldp');
const { connectPodProvider, clearAllData } = require('./initialize');
const { fetchMails } = require('./utils');

jest.setTimeout(80000);

const NUM_PODS = 3;

describe('Test contacts features', () => {
  let actors = [],
    podProvider,
    alice,
    bob,
    craig,
    contactRequestToBob,
    contactRequestToCraig,
    locationUri,
    eventUri;

  beforeAll(async () => {
    clearAllData();

    podProvider = await connectPodProvider();

    for (let i = 1; i <= NUM_PODS; i++) {
      const actorData = require(`./data/actor${i}.json`);
      const { webId } = await podProvider.call('auth.signup', actorData);
      actors[i] = await podProvider.call(
        'activitypub.actor.awaitCreateComplete',
        {
          actorUri: webId,
          additionalKeys: ['url', 'apods:contacts', 'apods:contactRequests', 'apods:rejectedContacts']
        },
        { meta: { dataset: actorData.username } }
      );
      actors[i].call = (actionName, params, options = {}) =>
        podProvider.call(actionName, params, {
          ...options,
          meta: { ...options.meta, webId, dataset: actors[i].preferredUsername }
        });
    }

    alice = actors[1];
    bob = actors[2];
    craig = actors[3];
  });

  afterAll(async () => {
    await podProvider.stop();
  });

  test('Alice offers her contact to Bob and Craig', async () => {
    contactRequestToBob = await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.OFFER,
      actor: alice.id,
      object: {
        type: ACTIVITY_TYPES.ADD,
        object: alice.url
      },
      content: 'Hey Bob, do you remember me ?',
      target: bob.id,
      to: bob.id
    });

    await waitForExpect(async () => {
      await expect(fetchMails()).resolves.toContainEqual(
        expect.objectContaining({
          recipients: ['<bob@test.com>'],
          subject: 'Alice would like to connect with you'
        })
      );
    }, 80_000);

    await waitForExpect(async () => {
      await expect(
        alice.call('webacl.resource.hasRights', {
          resourceUri: alice.url,
          rights: { read: true },
          webId: bob.id
        })
      ).resolves.toMatchObject({ read: true });
    });

    await waitForExpect(async () => {
      await expect(
        bob.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contactRequests'],
          itemUri: contactRequestToBob.id
        })
      ).resolves.toBeTruthy();
    });

    contactRequestToCraig = await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.OFFER,
      actor: alice.id,
      object: {
        type: ACTIVITY_TYPES.ADD,
        object: alice.url
      },
      content: 'Hey Craig, long time no see !',
      target: craig.id,
      to: craig.id
    });

    await waitForExpect(async () => {
      await expect(
        bob.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contactRequests'],
          itemUri: contactRequestToCraig.id
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      await expect(fetchMails()).resolves.toContainEqual(
        expect.objectContaining({
          recipients: ['<craig@test.com>'],
          subject: 'Alice would like to connect with you'
        })
      );
    }, 80_000);
  });

  test('Bob accept Alice contact request', async () => {
    await bob.call('activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: ACTIVITY_TYPES.ACCEPT,
      actor: bob.id,
      object: contactRequestToBob.id,
      to: alice.id
    });

    await waitForExpect(async () => {
      await expect(
        bob.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contactRequests'],
          itemUri: contactRequestToBob.id
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
          webId: 'system'
        })
      ).resolves.toBeTruthy();
    });

    // Bob profile is attached to Alice /profiles container
    await waitForExpect(async () => {
      await expect(
        alice.call('ldp.container.includes', {
          containerUri: urlJoin(alice.id, 'data', 'vcard', 'individual'),
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
          webId: 'system'
        })
      ).resolves.toBeTruthy();
    });

    // Alice profile is attached to Bob /profiles container
    await waitForExpect(async () => {
      await expect(
        bob.call('ldp.container.includes', {
          containerUri: urlJoin(bob.id, 'data', 'vcard', 'individual'),
          resourceUri: alice.url,
          webId: bob.id
        })
      ).resolves.toBeTruthy();
    });

    await waitForExpect(async () => {
      await expect(fetchMails()).resolves.toContainEqual(
        expect.objectContaining({
          recipients: ['<alice@test.com>'],
          subject: 'Bob is now part of your network'
        })
      );
    }, 80_000);
  });

  test('Craig reject Alice contact request', async () => {
    await craig.call('activitypub.outbox.post', {
      collectionUri: craig.outbox,
      type: ACTIVITY_TYPES.REJECT,
      actor: craig.id,
      object: contactRequestToCraig.id,
      to: alice.id
    });

    await waitForExpect(async () => {
      await expect(
        craig.call('activitypub.collection.includes', {
          collectionUri: craig['apods:contactRequests'],
          itemUri: contactRequestToCraig.id
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      await expect(
        craig.call('activitypub.collection.includes', {
          collectionUri: craig['apods:rejectedContacts'],
          itemUri: alice.id
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
          itemUri: alice.id
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      await expect(
        bob.call('ldp.container.includes', {
          containerUri: urlJoin(bob.id, 'data', 'vcard', 'individual'),
          resourceUri: alice.url,
          webId: alice.id
        })
      ).resolves.toBeFalsy();
    });
  });

  test('Bob requests Alice to remove all his data from her Pod', async () => {
    const activity = await bob.call(
      'activitypub.outbox.post',
      {
        collectionUri: bob.outbox,
        type: ACTIVITY_TYPES.DELETE,
        actor: bob.id,
        object: bob.id,
        to: alice.id
      },
      { meta: { doNotProcessObject: true } }
    );

    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: alice['apods:contacts'],
          itemUri: bob.id
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      await expect(
        alice.call('ldp.container.includes', {
          containerUri: urlJoin(alice.id, 'data', 'vcard', 'individual'),
          resourceUri: bob.url
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      // TODO new action to only get most recent item in collection
      const outboxMenu = await bob.call('activitypub.collection.get', {
        resourceUri: bob.inbox
      });

      const outbox = await alice.call('activitypub.collection.get', {
        resourceUri: alice.outbox,
        afterEq: new URL(outboxMenu?.first).searchParams.get('afterEq')
      });

      await expect(arrayOf(outbox.orderedItems)[0]).toMatchObject({
        type: ACTIVITY_TYPES.ACCEPT,
        object: activity.id,
        actor: alice.id,
        to: bob.id
      });
    });
  });
});
