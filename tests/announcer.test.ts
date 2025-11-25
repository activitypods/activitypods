import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { ServiceBroker } from 'moleculer';
import { OBJECT_TYPES, ACTIVITY_TYPES } from '@semapps/activitypub';
import { connectPodProvider, createTestActor, clearAllData } from './initialize.ts';
import * as CONFIG from './config.ts';
import { TestActor } from './utilTypes.js';

jest.setTimeout(120000);

describe('Test sharing through announcer', () => {
  let podProvider: ServiceBroker,
    alice: TestActor,
    bob: TestActor,
    craig: TestActor,
    eventContainerUri: string,
    eventUri: string,
    event: any;

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
      }
    });
  });

  test('Alice shares her event with Bob and he is added to the announces collection', async () => {
    await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.ANNOUNCE,
      object: eventUri,
      to: bob.id
    });

    // The announces collection is attached to Alice event
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      event = await alice.call('ldp.resource.get', { resourceUri: eventUri });
      expect(event['apods:announces']).not.toBeUndefined();
    });

    // Bob is added to the announces collection
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: event['apods:announces'],
          itemUri: bob.id
        })
      ).resolves.toBeTruthy();
    });
  });

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
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      event = await alice.call('ldp.resource.get', { resourceUri: eventUri });
      expect(event['apods:announcers']).not.toBeUndefined();
    });

    // Bob is added to the announcers collection
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: event['apods:announcers'],
          itemUri: bob.id
        })
      ).resolves.toBeTruthy();
    });

    // Bob can fetch Alice event
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(bob.call('ldp.resource.get', { resourceUri: eventUri })).resolves.not.toThrow();
    });

    // Bob can fetch the announces collection
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(bob.call('ldp.resource.get', { resourceUri: event['apods:announces'] })).resolves.not.toThrow();
    });

    // Bob cannot fetch the announcers collection
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(bob.call('ldp.resource.get', { resourceUri: event['apods:announcers'] })).rejects.toThrow();
    });
  });

  test('Bob shares Alice event with Craig and Craig is added to the announces collection', async () => {
    await bob.call('activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: ACTIVITY_TYPES.ANNOUNCE,
      object: eventUri,
      to: craig.id
    });

    // Craig is added to the announces collection
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: event['apods:announces'],
          itemUri: bob.id
        })
      ).resolves.toBeTruthy();
    });

    // Craig can fetch Alice event
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(craig.call('ldp.resource.get', { resourceUri: eventUri })).resolves.not.toThrow();
    });

    // Craig cannot fetch the announces collection
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(craig.call('ldp.resource.get', { resourceUri: event['apods:announces'] })).rejects.toThrow();
    });

    // Craig cannot fetch the announcers collection
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(craig.call('ldp.resource.get', { resourceUri: event['apods:announcers'] })).rejects.toThrow();
    });
  });
});
