const waitForExpect = require('wait-for-expect');
const { ACTIVITY_TYPES, OBJECT_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const initialize = require('./initialize');
const path = require('path');

jest.setTimeout(30000);

let broker;

const mockInvitation = jest.fn(() => Promise.resolve('Fake Invitation'));
const mockJoinOrLeave = jest.fn(() => Promise.resolve('Fake Join Or Leave'));

beforeAll(async () => {
  broker = await initialize();

  await broker.loadService(path.resolve(__dirname, './services/core.service.js'));
  await broker.loadService(path.resolve(__dirname, './services/events.app.js'));
  await broker.loadService(path.resolve(__dirname, './services/synchronizer.app.js'));

  // Mock notification service
  await broker.createService({
    name: 'notification',
    actions: {
      invitation: mockInvitation,
      joinOrLeave: mockJoinOrLeave
    },
  });

  await broker.start();
});

afterAll(async () => {
  await broker.stop();
});

describe('Test contacts app', () => {
  let actors = [],
    alice,
    bob,
    craig,
    daisy,
    eventUri;

  test('Create 4 pods', async () => {
    for (let i = 1; i <= 4; i++) {
      const actorData = require(`./data/actor${i}.json`);

      const { webId } = await broker.call('auth.signup', actorData);

      actors[i] = await broker.call('activitypub.actor.awaitCreateComplete', { actorUri: webId });

      expect(actors[i].preferredUsername).toBe(actorData.username);
    }

    alice = actors[1];
    bob = actors[2];
    craig = actors[3];
    daisy = actors[4];
  });

  test('Alice create an event', async () => {
    eventUri  = await broker.call('ldp.container.post', {
      containerUri: alice.id + '/data/events',
      resource: {
        type: OBJECT_TYPES.EVENT,
        name: "Birthday party !!"
      },
      contentType: MIME_TYPES.JSON,
      webId: alice.id
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('webacl.group.exist', {
          groupSlug: new URL(eventUri).pathname + '/invitees',
          webId: 'system',
        })
      ).resolves.toBeTruthy();
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/attendees',
          itemUri: alice.id,
        })
      ).resolves.toBeTruthy();
    });
  });

  test('Alice invite Bob and Craig to her event', async () => {
    await broker.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.INVITE,
      actor: alice.id,
      object: eventUri,
      target: [bob.id, craig.id],
      to: [bob.id, craig.id]
    });

    await waitForExpect(() => {
      expect(mockInvitation).toHaveBeenCalledTimes(2);
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/invitees',
          itemUri: bob.id,
        })
      ).resolves.toBeTruthy();
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/inviters',
          itemUri: bob.id,
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('webacl.resource.hasRights', {
          resourceUri: eventUri,
          rights: { read: true },
          webId: bob.id,
        })
      ).resolves.toMatchObject({ read: true });
    });

    // Alice event is cached in Bob dataset
    await waitForExpect(async () => {
      await expect(
        broker.call('triplestore.countTriplesOfSubject', {
          uri: eventUri,
          dataset: bob.preferredUsername,
          webId: 'system',
        })
      ).resolves.toBeTruthy();
    });
  });

  test('Alice offer Craig to invite his contacts to her event', async () => {
    await broker.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.OFFER,
      actor: alice.id,
      object: {
        type: ACTIVITY_TYPES.INVITE,
        object: eventUri
      },
      target: craig.id,
      to: craig.id,
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/inviters',
          itemUri: craig.id,
        })
      ).resolves.toBeTruthy();
    });
  });

  test('Craig invite Daisy to Alice event', async () => {
    await broker.call('activitypub.outbox.post', {
      collectionUri: craig.outbox,
      type: ACTIVITY_TYPES.OFFER,
      actor: craig.id,
      object: {
        type: ACTIVITY_TYPES.INVITE,
        actor: alice.id,
        object: eventUri,
        target: daisy.id
      },
      target: alice.id,
      to: alice.id,
    });

    await waitForExpect(() => {
      expect(mockInvitation).toHaveBeenCalledTimes(2);
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/invitees',
          itemUri: daisy.id,
        })
      ).resolves.toBeTruthy();
    });
  });

  test('Bob join Alice event', async () => {
    await broker.call('activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: ACTIVITY_TYPES.JOIN,
      actor: bob.id,
      object: eventUri,
      to: alice.id,
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/attendees',
          itemUri: bob.id,
        })
      ).resolves.toBeTruthy();
    });
  });

  test('Bob leave Alice event', async () => {
    await broker.call('activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: ACTIVITY_TYPES.LEAVE,
      actor: bob.id,
      object: eventUri,
      to: alice.id,
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/attendees',
          itemUri: bob.id,
        })
      ).resolves.toBeFalsy();
    });
  });
});
