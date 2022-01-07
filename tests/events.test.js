const waitForExpect = require('wait-for-expect');
const { ACTIVITY_TYPES, OBJECT_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const initialize = require('./initialize');
const path = require('path');

jest.setTimeout(30000);

let broker;

const mockNotifyUser = jest.fn(() => Promise.resolve());

beforeAll(async () => {
  broker = await initialize();

  await broker.loadService(path.resolve(__dirname, './services/core.service.js'));
  await broker.loadService(path.resolve(__dirname, './services/contacts.app.js'));
  await broker.loadService(path.resolve(__dirname, './services/events.app.js'));
  await broker.loadService(path.resolve(__dirname, './services/synchronizer.app.js'));

  // Mock notification service
  await broker.createService({
    name: 'notification',
    actions: {
      notifyUser: mockNotifyUser,
    },
  });

  await broker.start();
});

afterAll(async () => {
  await broker.stop();
});

describe('Test events app', () => {
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

      actors[i] = await broker.call('activitypub.actor.awaitCreateComplete', {
        actorUri: webId,
        additionalKeys: ['url', 'apods:contacts', 'apods:contactRequests', 'apods:rejectedContacts'],
      });

      expect(actors[i].preferredUsername).toBe(actorData.username);
    }

    alice = actors[1];
    bob = actors[2];
    craig = actors[3];
    daisy = actors[4];

    // Add Alice and Bob in each others contacts (this will be used for attendees matching)
    await broker.call('activitypub.collection.attach', {
      collectionUri: alice['apods:contacts'],
      itemUri: bob.id,
    });
    await broker.call('activitypub.collection.attach', {
      collectionUri: bob['apods:contacts'],
      itemUri: alice.id,
    });
  });

  test('Alice create an event', async () => {
    eventUri = await broker.call('events.event.post', {
      containerUri: alice.id + '/data/events',
      resource: {
        type: OBJECT_TYPES.EVENT,
        name: 'Birthday party !!',
      },
      contentType: MIME_TYPES.JSON,
      webId: alice.id,
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
      to: [bob.id, craig.id],
    });

    await waitForExpect(() => {
      expect(mockNotifyUser).toHaveBeenCalledTimes(2);
    });

    expect(mockNotifyUser.mock.calls[0][0].params.key).toBe('invitation');
    expect(mockNotifyUser.mock.calls[1][0].params.key).toBe('invitation');

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

    // An invitees has the right to see the list of attendees
    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.get', {
          collectionUri: eventUri + '/attendees',
          webId: alice.id,
        })
      ).resolves.not.toBeNull();
    });
  });

  test('Alice offer Craig to invite his contacts to her event', async () => {
    await broker.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.OFFER,
      actor: alice.id,
      object: {
        type: ACTIVITY_TYPES.INVITE,
        object: eventUri,
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

    // An inviter has the right to see the list of invitees
    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.get', {
          collectionUri: eventUri + '/invitees',
          webId: craig.id,
        })
      ).resolves.not.toBeNull();
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
        target: daisy.id,
      },
      target: alice.id,
      to: alice.id,
    });

    await waitForExpect(() => {
      expect(mockNotifyUser).toHaveBeenCalledTimes(3);
    });

    expect(mockNotifyUser.mock.calls[2][0].params.key).toBe('invitation');

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/invitees',
          itemUri: daisy.id,
        })
      ).resolves.toBeTruthy();
    });
  });

  test('Bob, Craig and Daisy join Alice event', async () => {
    await broker.call('activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: ACTIVITY_TYPES.JOIN,
      actor: bob.id,
      object: eventUri,
      to: alice.id,
    });

    await broker.call('activitypub.outbox.post', {
      collectionUri: craig.outbox,
      type: ACTIVITY_TYPES.JOIN,
      actor: craig.id,
      object: eventUri,
      to: alice.id,
    });

    await broker.call('activitypub.outbox.post', {
      collectionUri: daisy.outbox,
      type: ACTIVITY_TYPES.JOIN,
      actor: daisy.id,
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

    // Alice should see the profile of all the attendees, even if they are not on her contacts
    await waitForExpect(async () => {
      await expect(
        broker.call('webacl.resource.hasRights', {
          resourceUri: daisy.url,
          rights: { read: true },
          webId: alice.id,
        })
      ).resolves.toMatchObject({ read: true });
    });

    await waitForExpect(() => {
      expect(mockNotifyUser).toHaveBeenCalledTimes(6);
    });

    expect(mockNotifyUser.mock.calls[3][0].params.key).toBe('join-event');
    expect(mockNotifyUser.mock.calls[4][0].params.key).toBe('join-event');
    expect(mockNotifyUser.mock.calls[5][0].params.key).toBe('join-event');
  });

  test('Event is coming', async () => {
    const now = new Date();
    let startTime = new Date(now),
      endTime = new Date(now);
    startTime.setDate(now.getDate() + 1);
    endTime.setDate(now.getDate() + 2);

    await broker.call('events.event.patch', {
      resourceUri: eventUri,
      resource: {
        '@id': eventUri,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
      contentType: MIME_TYPES.JSON,
      webId: alice.id,
    });

    await broker.call('events.status.tagComing');
    await broker.call('events.status.tagClosed');
    await broker.call('events.status.tagFinished');

    await expect(
      broker.call('activitypub.object.get', { objectUri: eventUri, actorUri: alice.id })
    ).resolves.toMatchObject({
      'apods:hasStatus': expect.arrayContaining(['apods:Coming', 'apods:Open']),
    });
  });

  test('Event is closed because registration are closed', async () => {
    const now = new Date();
    let startTime = new Date(now),
      endTime = new Date(now),
      closingTime = new Date(now);
    startTime.setDate(now.getDate() + 1);
    endTime.setDate(now.getDate() + 2);
    closingTime.setDate(now.getDate() - 1);

    await broker.call('events.event.patch', {
      resourceUri: eventUri,
      resource: {
        '@id': eventUri,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        'apods:closingTime': closingTime.toISOString(),
      },
      contentType: MIME_TYPES.JSON,
      webId: alice.id,
    });

    await broker.call('events.status.tagComing');
    await broker.call('events.status.tagClosed');
    await broker.call('events.status.tagFinished');

    await expect(
      broker.call('activitypub.object.get', { objectUri: eventUri, actorUri: alice.id })
    ).resolves.toMatchObject({
      'apods:hasStatus': expect.arrayContaining(['apods:Closed', 'apods:Coming']),
    });
  });

  test('Event is closed because max attendees is reached', async () => {
    const now = new Date();
    let startTime = new Date(now),
      endTime = new Date(now),
      closingTime = new Date(now);
    startTime.setDate(now.getDate() + 2);
    endTime.setDate(now.getDate() + 3);
    closingTime.setDate(now.getDate() + 3);

    await broker.call('events.event.patch', {
      resourceUri: eventUri,
      resource: {
        '@id': eventUri,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        'apods:closingTime': closingTime.toISOString(),
        'apods:maxAttendees': 4,
      },
      contentType: MIME_TYPES.JSON,
      webId: alice.id,
    });

    await broker.call('events.status.tagComing');
    await broker.call('events.status.tagClosed');
    await broker.call('events.status.tagFinished');

    await expect(
      broker.call('activitypub.object.get', { objectUri: eventUri, actorUri: alice.id })
    ).resolves.toMatchObject({
      'apods:hasStatus': expect.arrayContaining(['apods:Closed', 'apods:Coming']),
    });
  });

  test('Event is open again because Craig left', async () => {
    await broker.call('activitypub.outbox.post', {
      collectionUri: craig.outbox,
      type: ACTIVITY_TYPES.LEAVE,
      actor: craig.id,
      object: eventUri,
      to: alice.id,
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/attendees',
          itemUri: craig.id,
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(() => {
      expect(mockNotifyUser).toHaveBeenCalledTimes(7);
    });

    expect(mockNotifyUser.mock.calls[6][0].params.key).toBe('leave-event');

    // This shouldn't have an impact
    await broker.call('events.status.tagComing');
    await broker.call('events.status.tagClosed');
    await broker.call('events.status.tagFinished');

    await expect(
      broker.call('activitypub.object.get', { objectUri: eventUri, actorUri: alice.id })
    ).resolves.toMatchObject({
      'apods:hasStatus': expect.arrayContaining(['apods:Open', 'apods:Coming']),
    });
  });

  test('Event is finished and contact requests are sent', async () => {
    const now = new Date();
    let startTime = new Date(now),
      endTime = new Date(now);
    startTime.setDate(now.getDate() - 2);
    endTime.setDate(now.getDate() - 1);

    await broker.call('events.event.patch', {
      resourceUri: eventUri,
      resource: {
        '@id': eventUri,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      },
      contentType: MIME_TYPES.JSON,
      webId: alice.id,
    });

    await broker.call('events.status.tagComing');
    await broker.call('events.status.tagClosed');
    await broker.call('events.status.tagFinished');

    await expect(
      broker.call('activitypub.object.get', { objectUri: eventUri, actorUri: alice.id })
    ).resolves.toMatchObject({
      'apods:hasStatus': expect.arrayContaining(['apods:Closed', 'apods:Finished']),
    });

    // Daisy should receive two contact requests from Alice and Bob
    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.get', {
          collectionUri: daisy['apods:contactRequests'],
          webId: daisy.id,
        })
      ).resolves.toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({
            type: ACTIVITY_TYPES.OFFER,
            actor: alice.id,
          }),
          expect.objectContaining({
            type: ACTIVITY_TYPES.OFFER,
            actor: bob.id,
          }),
        ]),
        totalItems: 2,
      });
    });

    // Bob should only receive a contact request from Daisy (Alice is already in his contacts)
    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.get', {
          collectionUri: bob['apods:contactRequests'],
          webId: bob.id,
        })
      ).resolves.toMatchObject({
        items: expect.arrayContaining([
          expect.objectContaining({
            type: ACTIVITY_TYPES.OFFER,
            actor: daisy.id,
          }),
        ]),
        totalItems: 1,
      });
    });

    await waitForExpect(() => {
      expect(mockNotifyUser).toHaveBeenCalledTimes(11);
    });

    expect(mockNotifyUser.mock.calls[7][0].params.key).toBe('post-event-contact-offer');
    expect(mockNotifyUser.mock.calls[8][0].params.key).toBe('post-event-contact-offer');
    expect(mockNotifyUser.mock.calls[9][0].params.key).toBe('post-event-contact-offer');
    expect(mockNotifyUser.mock.calls[10][0].params.key).toBe('post-event-contact-offer');
  });
});
