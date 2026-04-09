const waitForExpect = require('wait-for-expect');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');
const { connectPodProvider, clearAllData } = require('./initialize');

jest.setTimeout(80000);

describe('FEP-c648: Blocked Collection', () => {
  let podProvider;
  let alice;
  let bob;

  const createActorCaller = (actor, webId, dataset) => ({
    ...actor,
    call: (actionName, params, options = {}) =>
      podProvider.call(actionName, params, {
        ...options,
        meta: { ...options.meta, webId, dataset }
      })
  });

  beforeAll(async () => {
    await clearAllData();
    podProvider = await connectPodProvider();

    const aliceData = require('./data/actor1.json');
    const bobData = require('./data/actor2.json');

    const { webId: aliceWebId } = await podProvider.call('auth.signup', aliceData);
    const { webId: bobWebId } = await podProvider.call('auth.signup', bobData);

    const aliceActor = await podProvider.call(
      'activitypub.actor.awaitCreateComplete',
      {
        actorUri: aliceWebId,
        additionalKeys: ['blocked']
      },
      { meta: { dataset: aliceData.username } }
    );

    const bobActor = await podProvider.call(
      'activitypub.actor.awaitCreateComplete',
      {
        actorUri: bobWebId,
        additionalKeys: ['blocked']
      },
      { meta: { dataset: bobData.username } }
    );

    alice = createActorCaller(aliceActor, aliceWebId, aliceActor.preferredUsername);
    bob = createActorCaller(bobActor, bobWebId, bobActor.preferredUsername);
  });

  afterAll(async () => {
    if (podProvider) {
      await podProvider.stop();
    }
  });

  test('Actor exposes blocked collection property', async () => {
    expect(alice.blocked).toBe(`http://localhost:3000/${alice.preferredUsername}/blocked`);

    await expect(
      alice.call('activitypub.collection.get', {
        resourceUri: alice.blocked
      })
    ).resolves.toMatchObject({
      id: alice.blocked,
      type: 'OrderedCollection'
    });
  });

  test('Blocked collection stores Block activities and removes them on Undo', async () => {
    const oldBlock = await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.BLOCK,
      actor: alice.id,
      object: bob.id,
      published: '2024-01-01T00:00:00.000Z',
      to: bob.id
    });

    const newBlock = await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.BLOCK,
      actor: alice.id,
      object: bob.id,
      published: '2025-01-01T00:00:00.000Z',
      to: bob.id
    });

    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: alice.blocked,
          itemUri: oldBlock.id
        })
      ).resolves.toBeTruthy();

      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: alice.blocked,
          itemUri: newBlock.id
        })
      ).resolves.toBeTruthy();
    });

    const blockedPage = await alice.call('activitypub.collection.get', {
      resourceUri: alice.blocked
    });

    const orderedItems = blockedPage.orderedItems || [];
    expect(Array.isArray(orderedItems)).toBeTruthy();
    expect(orderedItems.length).toBeGreaterThanOrEqual(2);
    expect(orderedItems[0]).toMatchObject({
      type: 'Block',
      id: newBlock.id,
      object: bob.id
    });

    await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.UNDO,
      actor: alice.id,
      object: oldBlock.id,
      to: bob.id
    });

    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: alice.blocked,
          itemUri: oldBlock.id
        })
      ).resolves.toBeFalsy();

      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: alice.blocked,
          itemUri: newBlock.id
        })
      ).resolves.toBeTruthy();
    });
  });
});