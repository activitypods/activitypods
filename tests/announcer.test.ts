// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
// @ts-expect-error TS(2305): Module '"@semapps/activitypub"' has no exported me... Remove this comment to see the full error message
import { OBJECT_TYPES, ACTIVITY_TYPES } from '@semapps/activitypub';
import { MIME_TYPES } from '@semapps/mime-types';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import { connectPodProvider, createActor, clearAllData } from './initialize.ts';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import CONFIG from './config.ts';
// @ts-expect-error TS(2304): Cannot find name 'jest'.
jest.setTimeout(120000);

// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('Test sharing through announcer', () => {
  let podProvider: any, alice: any, bob: any, craig: any, eventContainerUri, eventUri: any, event: any;

  // @ts-expect-error TS(2304): Cannot find name 'beforeAll'.
  beforeAll(async () => {
    clearAllData();

    podProvider = await connectPodProvider();

    alice = await createActor(podProvider, 'alice');
    bob = await createActor(podProvider, 'bob');
    craig = await createActor(podProvider, 'craig');
  });

  // @ts-expect-error TS(2304): Cannot find name 'afterAll'.
  afterAll(async () => {
    await podProvider.stop();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Alice creates an event', async () => {
    // Create container manually so that we don't need to install the app
    eventContainerUri = await alice.call('data-registrations.generateFromShapeTree', {
      shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
      podOwner: alice.id
    });

    eventUri = await alice.call('ldp.container.post', {
      containerUri: eventContainerUri,
      resource: {
        type: OBJECT_TYPES.EVENT,
        name: 'Birthday party !!'
      },
      contentType: MIME_TYPES.JSON
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Alice shares her event with Bob and he is added to the announces collection', async () => {
    await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.ANNOUNCE,
      object: eventUri,
      to: bob.id
    });

    // The announces collection is attached to Alice event
    await waitForExpect(async () => {
      event = await alice.call('ldp.resource.get', {
        resourceUri: eventUri,
        accept: MIME_TYPES.JSON
      });
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(event['apods:announces']).not.toBeUndefined();
    });

    // Bob is added to the announces collection
    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: event['apods:announces'],
          itemUri: bob.id
        })
      ).resolves.toBeTruthy();
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Alice gives Bob delegation permission and he is added to the announcers collection', async () => {
    await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.ANNOUNCE,
      object: eventUri,
      'interop:delegationAllowed': true,
      'interop:delegationLimit': 1,
      to: bob.id
    });

    // The announcers collection is attached to Alice event
    await waitForExpect(async () => {
      event = await alice.call('ldp.resource.get', {
        resourceUri: eventUri,
        accept: MIME_TYPES.JSON
      });
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(event['apods:announcers']).not.toBeUndefined();
    });

    // Bob is added to the announcers collection
    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: event['apods:announcers'],
          itemUri: bob.id
        })
      ).resolves.toBeTruthy();
    });

    // Bob can fetch Alice event
    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        bob.call('ldp.resource.get', {
          resourceUri: eventUri,
          accept: MIME_TYPES.JSON
        })
      ).resolves.not.toThrow();
    });

    // Bob can fetch the announces collection
    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        bob.call('ldp.resource.get', {
          resourceUri: event['apods:announces'],
          accept: MIME_TYPES.JSON
        })
      ).resolves.not.toThrow();
    });

    // Bob cannot fetch the announcers collection
    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        bob.call('ldp.resource.get', {
          resourceUri: event['apods:announcers'],
          accept: MIME_TYPES.JSON
        })
      ).rejects.toThrow();
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Bob shares Alice event with Craig and Craig is added to the announces collection', async () => {
    await bob.call('activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: ACTIVITY_TYPES.ANNOUNCE,
      object: eventUri,
      to: craig.id
    });

    // Craig is added to the announces collection
    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: event['apods:announces'],
          itemUri: bob.id
        })
      ).resolves.toBeTruthy();
    });

    // Craig can fetch Alice event
    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        craig.call('ldp.resource.get', {
          resourceUri: eventUri,
          accept: MIME_TYPES.JSON
        })
      ).resolves.not.toThrow();
    });

    // Craig cannot fetch the announces collection
    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        craig.call('ldp.resource.get', {
          resourceUri: event['apods:announces'],
          accept: MIME_TYPES.JSON
        })
      ).rejects.toThrow();
    });

    // Craig cannot fetch the announcers collection
    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        craig.call('ldp.resource.get', {
          resourceUri: event['apods:announcers'],
          accept: MIME_TYPES.JSON
        })
      ).rejects.toThrow();
    });
  });
});
