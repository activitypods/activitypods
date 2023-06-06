const waitForExpect = require('wait-for-expect');
const { ACTIVITY_TYPES, OBJECT_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const initialize = require('./initialize');
const path = require('path');
const urlJoin = require('url-join');
const notificationFilter = require('../boilerplate/services/mixins/notification-filter');

jest.setTimeout(30000);

let broker;

const mockSendNotification = jest.fn(() => Promise.resolve());

beforeAll(async () => {
  broker = await initialize();

  await broker.loadService(path.resolve(__dirname, './services/core.service.js'));
  await broker.loadService(path.resolve(__dirname, './services/announcer.service.js'));
  await broker.loadService(path.resolve(__dirname, './services/synchronizer.service.js'));
  await broker.loadService(path.resolve(__dirname, './services/profiles.app.js'));
  await broker.loadService(path.resolve(__dirname, './services/contacts.app.js'));
  await broker.loadService(path.resolve(__dirname, './services/events.app.js'));

  // Mock notification service
  await broker.createService({
    mixins: [notificationFilter, require('./services/notification.service')],
    actions: {
      send: mockSendNotification,
    },
  });

  await broker.start();
});

beforeEach(async () => {
  mockSendNotification.mockClear();
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
    contactRequestToCraig,
    eventUri;

  test('Create 3 pods', async () => {
    for (let i = 1; i <= 3; i++) {
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
  });

  test('Alice offers her contact to Bob and Craig', async () => {
    contactRequestToBob = await broker.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.OFFER,
      actor: alice.id,
      object: {
        type: ACTIVITY_TYPES.ADD,
        object: alice.url,
      },
      content: 'Salut Bob, tu te rappelles de moi ?',
      target: bob.id,
      to: bob.id,
    });

    await waitForExpect(() => {
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
    });

    expect(mockSendNotification.mock.calls[0][0].params.data.key).toBe('contact_request');

    await waitForExpect(async () => {
      await expect(
        broker.call('webacl.resource.hasRights', {
          resourceUri: alice.url,
          rights: { read: true },
          webId: bob.id,
        })
      ).resolves.toMatchObject({ read: true });
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contactRequests'],
          itemUri: contactRequestToBob.id,
        })
      ).resolves.toBeTruthy();
    });

    contactRequestToCraig = await broker.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.OFFER,
      actor: alice.id,
      object: {
        type: ACTIVITY_TYPES.ADD,
        object: alice.url,
      },
      content: 'Salut Craig, ça fait longtemps !',
      target: craig.id,
      to: craig.id,
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contactRequests'],
          itemUri: contactRequestToCraig.id,
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(() => {
      expect(mockSendNotification).toHaveBeenCalledTimes(2);
    });

    expect(mockSendNotification.mock.calls[1][0].params.data.key).toBe('contact_request');
  });

  test('Bob accept Alice contact request', async () => {
    await broker.call('activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: ACTIVITY_TYPES.ACCEPT,
      actor: bob.id,
      object: contactRequestToBob.id,
      to: alice.id,
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contactRequests'],
          itemUri: contactRequestToBob.id,
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', { collectionUri: bob['apods:contacts'], itemUri: alice.id })
      ).resolves.toBeTruthy();
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', { collectionUri: alice['apods:contacts'], itemUri: bob.id })
      ).resolves.toBeTruthy();
    });

    // Bob profile is cached in Alice dataset
    await waitForExpect(async () => {
      await expect(
        broker.call('triplestore.countTriplesOfSubject', {
          uri: alice.url,
          dataset: bob.preferredUsername,
          webId: 'system',
        })
      ).resolves.toBeTruthy();
    });

    // Alice profile is cached in Bob dataset
    await waitForExpect(async () => {
      await expect(
        broker.call('triplestore.countTriplesOfSubject', {
          uri: bob.url,
          dataset: alice.preferredUsername,
          webId: 'system',
        })
      ).resolves.toBeTruthy();
    });

    await waitForExpect(() => {
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
    });

    expect(mockSendNotification.mock.calls[0][0].params.data.key).toBe('accept_contact_request');
  });

  test('Craig reject Alice contact request', async () => {
    await broker.call('activitypub.outbox.post', {
      collectionUri: craig.outbox,
      type: ACTIVITY_TYPES.REJECT,
      actor: craig.id,
      object: contactRequestToCraig.id,
      to: alice.id,
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: craig['apods:contactRequests'],
          itemUri: contactRequestToCraig.id,
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: craig['apods:rejectedContacts'],
          itemUri: alice.id,
        })
      ).resolves.toBeTruthy();
    });
  });

  test('Alice creates an event', async () => {
    locationUri = await broker.call('profiles.location.post', {
      containerUri: alice.id + '/data/locations',
      resource: {
        type: 'vcard:Location',
        'vcard:given-name': 'Alice place',
      },
      contentType: MIME_TYPES.JSON,
      webId: alice.id,
    });

    eventUri = await broker.call('events.event.post', {
      containerUri: alice.id + '/data/events',
      resource: {
        type: OBJECT_TYPES.EVENT,
        name: 'Birthday party !!',
        location: locationUri,
      },
      contentType: MIME_TYPES.JSON,
      webId: alice.id,
    });

    // Event was created, Alice is attendee.
    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/attendees',
          itemUri: alice.id,
        })
      ).resolves.toBeTruthy();
    });
  });

  test('Bob ignores Alice', async () => {
    await broker.call('activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: ACTIVITY_TYPES.IGNORE,
      actor: bob.id,
      object: alice.id,
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: bob['apods:ignoredContacts'],
          itemUri: alice.id,
        })
      ).resolves.toBeTruthy();
    });
  });

  test('Alice invites Bob to her event, Bob is not notified', async () => {
    // Alice announces event.
    await broker.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.ANNOUNCE,
      actor: alice.id,
      object: eventUri,
      target: bob.id,
      to: bob.id,
    });
    // No notification was sent.
    expect(mockSendNotification).toHaveBeenCalledTimes(0);

    // No announcement is in Bob's collection.
    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/announces',
          itemUri: bob.id,
        })
      ).resolves.toBeFalsy();
    });

    // Bob has the right to see the event.
    await waitForExpect(async () => {
      await expect(
        broker.call('webacl.resource.hasRights', {
          resourceUri: eventUri,
          rights: { read: true },
          webId: bob.id,
        })
      ).resolves.toMatchObject({ read: true });
    });

    // Bob has the right to see the event location
    await waitForExpect(async () => {
      await expect(
        broker.call('webacl.resource.hasRights', {
          resourceUri: locationUri,
          rights: { read: true },
          webId: bob.id,
        })
      ).resolves.toMatchObject({ read: true });
    });

    // Alice's event is cached in Bob dataset
    // Timeout must be longer as there is a 10s delay before caching (see announcer service)
    await waitForExpect(async () => {
      await expect(
        broker.call('triplestore.countTriplesOfSubject', {
          uri: eventUri,
          dataset: bob.preferredUsername,
          webId: 'system',
        })
      ).resolves.toBeTruthy();
    }, 20000);

  });

  test('Bob un-ignores Alice from his contacts', async () => {
    // Bob sends undo ignore activity to his outbox.
    await broker.call('activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: ACTIVITY_TYPES.UNDO,
      object: {
        type: ACTIVITY_TYPES.IGNORE,
        actor: bob.id,
        object: alice.id,
      }
    });

    // Alice is not on Bob's ignore list anymore.
    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: bob['apods:ignoredContacts'],
          itemUri: alice.id,
        })
      ).resolves.toBeFalsy();
    });
  });

  test('Alice re-invites Bob to the event.', async () => {
    // Alice announces the event, again.
    await broker.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.ANNOUNCE,
      actor: alice.id,
      object: eventUri,
      target: bob.id,
      to: bob.id,
    });
    // A notification was now sent.
    await waitForExpect(() => {
      expect(mockSendNotification).toHaveBeenCalledTimes(1);
    });
    expect(mockSendNotification.mock.calls[0][0].params.data.key).toBe('new_event');
  });

  test('Bob removes Alice from his contacts', async () => {
    await broker.call('activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: ACTIVITY_TYPES.REMOVE,
      actor: bob.id,
      object: alice.id,
      origin: bob['apods:contacts'],
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('activitypub.collection.includes', {
          collectionUri: bob['apods:contacts'],
          itemUri: alice.id,
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      await expect(
        broker.call('ldp.container.includes', {
          containerUri: urlJoin(bob.url, 'data', 'profiles'),
          resourceUri: alice.url,
        })
      ).resolves.toBeFalsy();
    });
  });
});
