const waitForExpect = require('wait-for-expect');
const { ACTIVITY_TYPES, OBJECT_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const initialize = require('./initialize');
const path = require('path');

jest.setTimeout(30000);

let broker;

const mockInvitation = jest.fn(() => Promise.resolve('Fake Invitation'));

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
    contactRequestToBob,
    contactRequestToCraig;

  test('Create 3 pods', async () => {
    for (let i = 1; i <= 3; i++) {
      const actorData = require(`./data/actor${i}.json`);

      const { webId } = await broker.call('auth.signup', actorData);

      actors[i] = await broker.call('activitypub.actor.awaitCreateComplete', { actorUri: webId });

      expect(actors[i].preferredUsername).toBe(actorData.username);
    }

    alice = actors[1];
    bob = actors[2];
    craig = actors[3];
  });

  test('Alice invite Bob to her event', async () => {
    const eventUri = await broker.call('ldp.container.post', {
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

    contactRequestToBob = await broker.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.INVITE,
      actor: alice.id,
      object: eventUri,
      target: bob.id,
      to: bob.id,
    });

    await waitForExpect(() => {
      expect(mockInvitation).toHaveBeenCalledTimes(1);
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
  });
});
