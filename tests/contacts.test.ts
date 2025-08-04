// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
// @ts-expect-error TS(2305): Module '"@semapps/activitypub"' has no exported me... Remove this comment to see the full error message
import { ACTIVITY_TYPES } from '@semapps/activitypub';
// @ts-expect-error TS(2305): Module '"@semapps/ldp"' has no exported member 'ar... Remove this comment to see the full error message
import { arrayOf } from '@semapps/ldp';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import { connectPodProvider, clearAllData } from './initialize.ts';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import { fetchMails } from './utils.ts';
// @ts-expect-error TS(2304): Cannot find name 'jest'.
jest.setTimeout(80000);
const NUM_PODS = 3;

// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('Test contacts features', () => {
  let actors: any = [],
    podProvider: any,
    alice: any,
    bob: any,
    craig: any,
    contactRequestToBob: any,
    contactRequestToCraig: any;

  // @ts-expect-error TS(2304): Cannot find name 'beforeAll'.
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
      actors[i].call = (actionName: any, params: any, options = {}) =>
        podProvider.call(actionName, params, {
          ...options,
          // @ts-expect-error TS(2339): Property 'meta' does not exist on type '{}'.
          meta: { ...options.meta, webId, dataset: actors[i].preferredUsername }
        });
    }

    alice = actors[1];
    bob = actors[2];
    craig = actors[3];
  });

  // @ts-expect-error TS(2304): Cannot find name 'afterAll'.
  afterAll(async () => {
    await podProvider.stop();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(fetchMails()).resolves.toContainEqual(
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        expect.objectContaining({
          recipients: ['<bob@test.com>'],
          subject: 'Alice would like to connect with you'
        })
      );
    }, 80_000);

    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        alice.call('webacl.resource.hasRights', {
          resourceUri: alice.url,
          rights: { read: true },
          webId: bob.id
        })
      ).resolves.toMatchObject({ read: true });
    });

    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
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
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        bob.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contactRequests'],
          itemUri: contactRequestToCraig.id
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(fetchMails()).resolves.toContainEqual(
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        expect.objectContaining({
          recipients: ['<craig@test.com>'],
          subject: 'Alice would like to connect with you'
        })
      );
    }, 80_000);
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Bob accept Alice contact request', async () => {
    await bob.call('activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: ACTIVITY_TYPES.ACCEPT,
      actor: bob.id,
      object: contactRequestToBob.id,
      to: alice.id
    });

    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        bob.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contactRequests'],
          itemUri: contactRequestToBob.id
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        bob.call('activitypub.collection.includes', { collectionUri: bob['apods:contacts'], itemUri: alice.id })
      ).resolves.toBeTruthy();
    });

    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        alice.call('activitypub.collection.includes', { collectionUri: alice['apods:contacts'], itemUri: bob.id })
      ).resolves.toBeTruthy();
    });

    // Bob profile is cached in Alice dataset
    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
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
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
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
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
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
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        bob.call('ldp.container.includes', {
          containerUri: urlJoin(bob.id, 'data', 'vcard', 'individual'),
          resourceUri: alice.url,
          webId: bob.id
        })
      ).resolves.toBeTruthy();
    });

    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(fetchMails()).resolves.toContainEqual(
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        expect.objectContaining({
          recipients: ['<alice@test.com>'],
          subject: 'Bob is now part of your network'
        })
      );
    }, 80_000);
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Craig reject Alice contact request', async () => {
    await craig.call('activitypub.outbox.post', {
      collectionUri: craig.outbox,
      type: ACTIVITY_TYPES.REJECT,
      actor: craig.id,
      object: contactRequestToCraig.id,
      to: alice.id
    });

    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        craig.call('activitypub.collection.includes', {
          collectionUri: craig['apods:contactRequests'],
          itemUri: contactRequestToCraig.id
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        craig.call('activitypub.collection.includes', {
          collectionUri: craig['apods:rejectedContacts'],
          itemUri: alice.id
        })
      ).resolves.toBeTruthy();
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Bob removes Alice from his contacts', async () => {
    await bob.call('activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: ACTIVITY_TYPES.REMOVE,
      actor: bob.id,
      object: alice.id,
      origin: bob['apods:contacts']
    });

    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        bob.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contacts'],
          itemUri: alice.id
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        bob.call('ldp.container.includes', {
          containerUri: urlJoin(bob.id, 'data', 'vcard', 'individual'),
          resourceUri: alice.url,
          webId: alice.id
        })
      ).resolves.toBeFalsy();
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: alice['apods:contacts'],
          itemUri: bob.id
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
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

      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(arrayOf(outbox.orderedItems)[0]).toMatchObject({
        type: ACTIVITY_TYPES.ACCEPT,
        object: activity.id,
        actor: alice.id,
        to: bob.id
      });
    });
  });
});
