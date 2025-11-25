import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { ServiceBroker } from 'moleculer';
import { ACTIVITY_TYPES } from '@semapps/activitypub';
import { arrayOf } from '@semapps/ldp';
import { connectPodProvider, clearAllData, createTestActor } from './initialize.ts';
import { fetchMails } from './utils.ts';
import { TestActor } from './utilTypes.js';

jest.setTimeout(80000);

describe('Test contacts features', () => {
  let podProvider: ServiceBroker,
    alice: TestActor,
    bob: TestActor,
    craig: TestActor,
    contactRequestToBob: any,
    contactRequestToCraig: any;

  beforeAll(async () => {
    clearAllData();

    podProvider = await connectPodProvider();

    alice = await createTestActor(podProvider, 'alice');
    bob = await createTestActor(podProvider, 'bob');
    craig = await createTestActor(podProvider, 'craig');
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

    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(fetchMails()).resolves.toContainEqual(
        expect.objectContaining({
          recipients: ['<bob@test.com>'],
          subject: 'Alice would like to connect with you'
        })
      );
    }, 80_000);

    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        alice.call('webacl.resource.hasRights', {
          resourceUri: alice.url,
          rights: { read: true },
          webId: bob.id
        })
      ).resolves.toMatchObject({ read: true });
    });

    // @ts-expect-error This expression is not callable
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

    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        bob.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contactRequests'],
          itemUri: contactRequestToCraig.id
        })
      ).resolves.toBeFalsy();
    });

    // @ts-expect-error This expression is not callable
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

    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        bob.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contactRequests'],
          itemUri: contactRequestToBob.id
        })
      ).resolves.toBeFalsy();
    });

    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        bob.call('activitypub.collection.includes', { collectionUri: bob['apods:contacts'], itemUri: alice.id })
      ).resolves.toBeTruthy();
    });

    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', { collectionUri: alice['apods:contacts'], itemUri: bob.id })
      ).resolves.toBeTruthy();
    });

    // Alice profile is cached in Bob dataset
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        bob.call('triplestore.countTriplesOfSubject', {
          uri: alice.url,
          graphName: alice.url,
          dataset: bob.preferredUsername,
          webId: 'system'
        })
      ).resolves.toBeTruthy();
    });

    const bobProfilesContainerUri = await bob.getContainerUri('vcard:Individual');

    // Alice profile is attached to Bob /profiles container
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        bob.call('ldp.container.includes', {
          containerUri: bobProfilesContainerUri,
          resourceUri: alice.url,
          webId: bob.id
        })
      ).resolves.toBeTruthy();
    });

    // Bob profile is cached in Alice dataset
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        alice.call('triplestore.countTriplesOfSubject', {
          uri: bob.url,
          graphName: bob.url,
          dataset: alice.preferredUsername,
          webId: 'system'
        })
      ).resolves.toBeTruthy();
    });

    const aliceProfilesContainerUri = await alice.getContainerUri('vcard:Individual');

    // Bob profile is attached to Alice /profiles container
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        alice.call('ldp.container.includes', {
          containerUri: aliceProfilesContainerUri,
          resourceUri: bob.url,
          webId: alice.id
        })
      ).resolves.toBeTruthy();
    });

    // @ts-expect-error This expression is not callable
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

    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        craig.call('activitypub.collection.includes', {
          collectionUri: craig['apods:contactRequests'],
          itemUri: contactRequestToCraig.id
        })
      ).resolves.toBeFalsy();
    });

    // @ts-expect-error This expression is not callable
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

    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        bob.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contacts'],
          itemUri: alice.id
        })
      ).resolves.toBeFalsy();
    });

    const bobProfilesContainerUri = await bob.getContainerUri('vcard:Individual');

    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        bob.call('ldp.container.includes', {
          containerUri: bobProfilesContainerUri,
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

    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: alice['apods:contacts'],
          itemUri: bob.id
        })
      ).resolves.toBeFalsy();
    });

    const aliceProfilesContainerUri = await alice.getContainerUri('vcard:Individual');

    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        alice.call('ldp.container.includes', {
          containerUri: aliceProfilesContainerUri,
          resourceUri: bob.url
        })
      ).resolves.toBeFalsy();
    });

    // @ts-expect-error This expression is not callable
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
