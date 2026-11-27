import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { OBJECT_TYPES, ACTIVITY_TYPES } from '@semapps/activitypub';
import { MIME_TYPES } from '@semapps/mime-types';
import { connectPodProvider, createActor, clearAllData } from './initialize.ts';
import * as CONFIG from './config.ts';
jest.setTimeout(120000);

describe('Test sharing through announcer', () => {
  let podProvider: any, alice: any, bob: any, craig: any, eventContainerUri, eventUri: any, event: any;

  beforeAll(async () => {
    clearAllData();

    podProvider = await connectPodProvider();

    alice = await createActor(podProvider, 'alice');
    bob = await createActor(podProvider, 'bob');
    craig = await createActor(podProvider, 'craig');
  });

  afterAll(async () => {
    await podProvider.stop();
  });

  const isAnnounced = (actor: any) =>
    alice.call('activitypub.collection.includes', { collectionUri: event['apods:announces'], itemUri: actor.id });

  const isInAnnouncesGroup = async (actor: any) => {
    const groupUri = urlJoin(new URL(alice.id).origin, '_groups', new URL(eventUri).pathname, 'announces');
    const members = await podProvider.call(
      'webacl.group.getMembers',
      { groupUri, webId: 'system' },
      { meta: { dataset: 'alice' } }
    );
    return members.includes(actor.id);
  };

  const canRead = async (actor: any) => {
    const { read } = await podProvider.call('webacl.resource.hasRights', {
      resourceUri: eventUri,
      rights: { read: true },
      webId: actor.id
    });
    return read;
  };

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
      expect(event['apods:announces']).not.toBeUndefined();
    });

    // Bob is added to the announces collection
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
    await waitForExpect(async () => {
      event = await alice.call('ldp.resource.get', {
        resourceUri: eventUri,
        accept: MIME_TYPES.JSON
      });
      expect(event['apods:announcers']).not.toBeUndefined();
    });

    // Bob is added to the announcers collection
    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: event['apods:announcers'],
          itemUri: bob.id
        })
      ).resolves.toBeTruthy();
    });

    // The grant with the delegation right is stored in Bob storage
    await waitForExpect(async () => {
      await expect(bob.call('access-grants.getByResourceUri', { resourceUri: eventUri })).resolves.toMatchObject({
        'interop:delegationAllowed': true
      });
    });

    // Bob can fetch Alice event
    await waitForExpect(async () => {
      await expect(
        bob.call('ldp.resource.get', {
          resourceUri: eventUri,
          accept: MIME_TYPES.JSON
        })
      ).resolves.not.toThrow();
    });

    // Bob can fetch the announces collection
    await waitForExpect(async () => {
      await expect(
        bob.call('ldp.resource.get', {
          resourceUri: event['apods:announces'],
          accept: MIME_TYPES.JSON
        })
      ).resolves.not.toThrow();
    });

    // Bob cannot fetch the announcers collection
    await waitForExpect(async () => {
      await expect(
        bob.call('ldp.resource.get', {
          resourceUri: event['apods:announcers'],
          accept: MIME_TYPES.JSON
        })
      ).rejects.toThrow();
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
    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: event['apods:announces'],
          itemUri: craig.id
        })
      ).resolves.toBeTruthy();
    });

    // Craig can fetch Alice event
    await waitForExpect(async () => {
      await expect(
        craig.call('ldp.resource.get', {
          resourceUri: eventUri,
          accept: MIME_TYPES.JSON
        })
      ).resolves.not.toThrow();
    });

    // Craig cannot fetch the announces collection
    await waitForExpect(async () => {
      await expect(
        craig.call('ldp.resource.get', {
          resourceUri: event['apods:announces'],
          accept: MIME_TYPES.JSON
        })
      ).rejects.toThrow();
    });

    // Craig cannot fetch the announcers collection
    await waitForExpect(async () => {
      await expect(
        craig.call('ldp.resource.get', {
          resourceUri: event['apods:announcers'],
          accept: MIME_TYPES.JSON
        })
      ).rejects.toThrow();
    });
  });

  test('Bob stops sharing Alice event with Craig and Craig is removed from the announces collection', async () => {
    await bob.call('access-authorizations.removeForSingleResource', { resourceUri: eventUri, grantee: craig.id });

    await waitForExpect(async () => {
      await expect(isAnnounced(craig)).resolves.toBeFalsy();
      await expect(isInAnnouncesGroup(craig)).resolves.toBeFalsy();
    });

    await expect(canRead(craig)).resolves.toBeFalsy();
    await expect(canRead(bob)).resolves.toBeTruthy();
  });

  test('Alice stops sharing her event with Bob and he is removed from the announces and announcers collections', async () => {
    await alice.call('access-authorizations.removeForSingleResource', { resourceUri: eventUri, grantee: bob.id });

    await waitForExpect(async () => {
      await expect(isAnnounced(bob)).resolves.toBeFalsy();
      await expect(isInAnnouncesGroup(bob)).resolves.toBeFalsy();
      await expect(
        alice.call('activitypub.collection.includes', { collectionUri: event['apods:announcers'], itemUri: bob.id })
      ).resolves.toBeFalsy();
    });

    await expect(canRead(bob)).resolves.toBeFalsy();
  });
});
