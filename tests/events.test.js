const path = require('path');
const waitForExpect = require('wait-for-expect');
const { ACTIVITY_TYPES, OBJECT_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const { arrayOf } = require('@semapps/ldp');
const { initialize, listDatasets, clearDataset } = require('./initialize');

jest.setTimeout(80000);

const NUM_PODS = 4;

const delay = t => new Promise(resolve => setTimeout(resolve, t));

const mockSendNotification = jest.fn(() => Promise.resolve());

const initializeBroker = async (port, accountsDataset) => {
  const broker = await initialize(port, accountsDataset);

  await broker.loadService(path.resolve(__dirname, './services/profiles.app.js'));
  await broker.loadService(path.resolve(__dirname, './services/contacts.app.js'));
  await broker.loadService(path.resolve(__dirname, './services/events.app.js'));

  // Mock notification service
  await broker.createService({
    mixins: [require('./services/notification.service')],
    actions: {
      send: mockSendNotification
    }
  });

  await broker.start();

  return broker;
};

describe.each(['single-server', 'multi-server'])('In mode %s, test events app', mode => {
  let actors = [],
    broker,
    alice,
    bob,
    craig,
    daisy,
    eventUri,
    event,
    locationUri;

  beforeAll(async () => {
    const datasets = await listDatasets();
    for (let dataset of datasets) {
      await clearDataset(dataset);
    }

    mockSendNotification.mockReset();

    if (mode === 'single-server') {
      broker = await initializeBroker(3000, 'settings');
    } else {
      broker = [];
    }

    for (let i = 1; i <= NUM_PODS; i++) {
      if (mode === 'multi-server') {
        broker[i] = await initializeBroker(3000 + i, 'settings' + i);
      } else {
        broker[i] = broker;
      }

      const actorData = require(`./data/actor${i}.json`);
      const { webId } = await broker[i].call('auth.signup', actorData);
      actors[i] = await broker[i].call(
        'activitypub.actor.awaitCreateComplete',
        {
          actorUri: webId,
          additionalKeys: ['url', 'apods:contacts', 'apods:contactRequests', 'apods:rejectedContacts']
        },
        { meta: { dataset: actorData.username } }
      );
      actors[i].call = (actionName, params, options = {}) =>
        broker[i].call(actionName, params, {
          ...options,
          meta: { ...options.meta, webId, dataset: actors[i].preferredUsername }
        });
    }

    alice = actors[1];
    bob = actors[2];
    craig = actors[3];
    daisy = actors[4];

    // Manually exchange contacts between Alice and Bob (this will ne used for attendees matching)
    await alice.call('activitypub.collection.attach', {
      collectionUri: alice['apods:contacts'],
      itemUri: bob.id
    });

    await bob.call('activitypub.collection.attach', {
      collectionUri: bob['apods:contacts'],
      itemUri: alice.id
    });
  }, 80001);

  afterAll(async () => {
    if (mode === 'multi-server') {
      for (let i = 1; i <= NUM_PODS; i++) {
        await broker[i].stop();
      }
    } else {
      await broker.stop();
    }
  });

  test('Alice create an event', async () => {
    locationUri = await alice.call('profiles.location.post', {
      containerUri: alice.id + '/data/locations',
      resource: {
        type: 'vcard:Location',
        'vcard:given-name': 'Alice place'
      },
      contentType: MIME_TYPES.JSON
    });

    eventUri = await alice.call('events.event.post', {
      containerUri: alice.id + '/data/events',
      resource: {
        type: OBJECT_TYPES.EVENT,
        name: 'Birthday party !!',
        location: locationUri
      },
      contentType: MIME_TYPES.JSON
    });

    event = await alice.call('events.event.get', {
      resourceUri: eventUri,
      accept: MIME_TYPES.JSON
    });

    await waitForExpect(async () => {
      await expect(
        alice.call('webacl.group.exist', {
          groupSlug: new URL(eventUri).pathname + '/announces',
          webId: 'system'
        })
      ).resolves.toBeTruthy();
    });

    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/attendees',
          itemUri: alice.id
        })
      ).resolves.toBeTruthy();
    });
  });

  test('Alice invite Bob and Craig to her event', async () => {
    await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.ANNOUNCE,
      actor: alice.id,
      object: eventUri,
      target: [bob.id, craig.id],
      to: [bob.id, craig.id]
    });

    await waitForExpect(() => {
      expect(mockSendNotification).toHaveBeenCalledTimes(2);
    }, 20000);

    expect(mockSendNotification.mock.calls[0][0].params.data.key).toBe('new_event');
    expect(mockSendNotification.mock.calls[1][0].params.data.key).toBe('new_event');

    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/announces',
          itemUri: bob.id
        })
      ).resolves.toBeTruthy();
    });

    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/announcers',
          itemUri: bob.id
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(async () => {
      await expect(
        alice.call('webacl.resource.hasRights', {
          resourceUri: eventUri,
          rights: { read: true },
          webId: bob.id
        })
      ).resolves.toMatchObject({ read: true });
    });

    // An invitee has the right to see the event location
    await waitForExpect(async () => {
      await expect(
        alice.call('webacl.resource.hasRights', {
          resourceUri: locationUri,
          rights: { read: true },
          webId: bob.id
        })
      ).resolves.toMatchObject({ read: true });
    });

    // Alice event is cached in Bob dataset
    // Timeout must be longer as there is a 10s delay before caching (see announcer service)
    await waitForExpect(async () => {
      await expect(
        bob.call('triplestore.countTriplesOfSubject', {
          uri: eventUri,
          webId: 'system' // TODO change
        })
      ).resolves.toBeTruthy();
    }, 20000);

    // Someone who was shared the event has the right to see the list of attendees
    await waitForExpect(async () => {
      await expect(
        alice.call('webacl.resource.hasRights', {
          resourceUri: eventUri + '/attendees',
          rights: { read: true },
          webId: bob.id
        })
      ).resolves.not.toBeNull();
    });
  });

  test('Alice change the location of her event', async () => {
    const newLocationUri = await alice.call('profiles.location.post', {
      containerUri: alice.id + '/data/locations',
      resource: {
        type: 'vcard:Location',
        'vcard:given-name': 'Alice other place'
      },
      contentType: MIME_TYPES.JSON
    });

    event.location = newLocationUri;

    await alice.call('events.event.put', {
      resource: event,
      contentType: MIME_TYPES.JSON
    });

    // Ensure the invitees have the right to see the new location
    await waitForExpect(async () => {
      await expect(
        alice.call('webacl.resource.hasRights', {
          resourceUri: newLocationUri,
          rights: { read: true },
          webId: bob.id
        })
      ).resolves.toMatchObject({ read: true });
    });

    // Ensure the invitees cannot see the old location anymore
    await waitForExpect(async () => {
      await expect(
        alice.call('webacl.resource.hasRights', {
          resourceUri: locationUri,
          rights: { read: true },
          webId: bob.id
        })
      ).resolves.toMatchObject({ read: false });
    });
  });

  test('Alice offer Craig to invite his contacts to her event', async () => {
    await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.OFFER,
      actor: alice.id,
      object: {
        type: ACTIVITY_TYPES.ANNOUNCE,
        object: eventUri
      },
      target: craig.id,
      to: craig.id
    });

    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/announcers',
          itemUri: craig.id
        })
      ).resolves.toBeTruthy();
    });

    // An announcer has the right to see the list of announces
    await waitForExpect(async () => {
      await expect(
        alice.call('webacl.resource.hasRights', {
          resourceUri: eventUri + '/announces',
          rights: { read: true },
          webId: craig.id
        })
      ).resolves.not.toBeNull();
    });
  });

  test('Craig invite Daisy to Alice event', async () => {
    await craig.call('activitypub.outbox.post', {
      collectionUri: craig.outbox,
      type: ACTIVITY_TYPES.OFFER,
      actor: craig.id,
      object: {
        type: ACTIVITY_TYPES.ANNOUNCE,
        actor: alice.id,
        object: eventUri,
        target: daisy.id
      },
      target: alice.id,
      to: alice.id
    });

    await waitForExpect(() => {
      expect(mockSendNotification).toHaveBeenCalledTimes(3);
    }, 20000);

    expect(mockSendNotification.mock.calls[2][0].params.data.key).toBe('new_event');

    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/announces',
          itemUri: daisy.id
        })
      ).resolves.toBeTruthy();
    });
  });

  test('Bob, Craig and Daisy join Alice event', async () => {
    await bob.call('activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: ACTIVITY_TYPES.JOIN,
      actor: bob.id,
      object: eventUri,
      to: alice.id
    });

    await craig.call('activitypub.outbox.post', {
      collectionUri: craig.outbox,
      type: ACTIVITY_TYPES.JOIN,
      actor: craig.id,
      object: eventUri,
      to: alice.id
    });

    await daisy.call('activitypub.outbox.post', {
      collectionUri: daisy.outbox,
      type: ACTIVITY_TYPES.JOIN,
      actor: daisy.id,
      object: eventUri,
      to: alice.id
    });

    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/attendees',
          itemUri: bob.id
        })
      ).resolves.toBeTruthy();
    });

    // Alice should see the profile of all the attendees, even if they are not on her contacts
    await waitForExpect(async () => {
      await expect(
        daisy.call('webacl.resource.hasRights', {
          resourceUri: daisy.url,
          rights: { read: true },
          webId: alice.id
        })
      ).resolves.toMatchObject({ read: true });
    });

    await waitForExpect(() => {
      expect(mockSendNotification).toHaveBeenCalledTimes(6);
    });

    expect(mockSendNotification.mock.calls[3][0].params.data.key).toBe('join_event');
    expect(mockSendNotification.mock.calls[4][0].params.data.key).toBe('join_event');
    expect(mockSendNotification.mock.calls[5][0].params.data.key).toBe('join_event');
  });

  test('Event is coming', async () => {
    const now = new Date();
    let startTime = new Date(now),
      endTime = new Date(now);
    startTime.setDate(now.getDate() + 1);
    endTime.setDate(now.getDate() + 2);

    event.startTime = startTime.toISOString();
    event.endTime = endTime.toISOString();

    await alice.call('events.event.put', {
      resourceUri: eventUri,
      resource: event,
      contentType: MIME_TYPES.JSON
    });

    await alice.call('events.status.tagComing');
    await alice.call('events.status.tagClosed');
    await alice.call('events.status.tagFinished');

    await expect(
      alice.call('activitypub.object.get', { objectUri: eventUri, actorUri: alice.id })
    ).resolves.toMatchObject({
      'apods:hasStatus': expect.arrayContaining(['apods:Coming', 'apods:Open'])
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

    event.startTime = startTime.toISOString();
    event.endTime = endTime.toISOString();
    event['apods:closingTime'] = closingTime.toISOString();

    await alice.call('events.event.put', {
      resourceUri: eventUri,
      resource: event,
      contentType: MIME_TYPES.JSON,
      webId: alice.id
    });

    await alice.call('events.status.tagComing');
    await alice.call('events.status.tagClosed');
    await alice.call('events.status.tagFinished');

    await expect(
      alice.call('activitypub.object.get', { objectUri: eventUri, actorUri: alice.id })
    ).resolves.toMatchObject({
      'apods:hasStatus': expect.arrayContaining(['apods:Closed', 'apods:Coming'])
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

    event.startTime = startTime.toISOString();
    event.endTime = endTime.toISOString();
    event['apods:closingTime'] = closingTime.toISOString();
    event['apods:maxAttendees'] = 4;

    await alice.call('events.event.put', {
      resourceUri: eventUri,
      resource: event,
      contentType: MIME_TYPES.JSON,
      webId: alice.id
    });

    await alice.call('events.status.tagComing');
    await alice.call('events.status.tagClosed');
    await alice.call('events.status.tagFinished');

    await expect(
      alice.call('activitypub.object.get', { objectUri: eventUri, actorUri: alice.id })
    ).resolves.toMatchObject({
      'apods:hasStatus': expect.arrayContaining(['apods:Closed', 'apods:Coming'])
    });
  });

  test('Event is open again because Craig left', async () => {
    await craig.call('activitypub.outbox.post', {
      collectionUri: craig.outbox,
      type: ACTIVITY_TYPES.LEAVE,
      actor: craig.id,
      object: eventUri,
      to: alice.id
    });

    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.collection.includes', {
          collectionUri: eventUri + '/attendees',
          itemUri: craig.id
        })
      ).resolves.toBeFalsy();
    });

    await waitForExpect(() => {
      expect(mockSendNotification).toHaveBeenCalledTimes(7);
    });

    expect(mockSendNotification.mock.calls[6][0].params.data.key).toBe('leave_event');

    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.object.get', { objectUri: eventUri, actorUri: alice.id })
      ).resolves.toMatchObject({
        'apods:hasStatus': expect.arrayContaining(['apods:Open', 'apods:Coming'])
      });
    }, 15000);

    // This shouldn't have an impact
    await alice.call('events.status.tagComing');
    await alice.call('events.status.tagClosed');
    await alice.call('events.status.tagFinished');

    await waitForExpect(async () => {
      await expect(
        alice.call('activitypub.object.get', { objectUri: eventUri, actorUri: alice.id })
      ).resolves.toMatchObject({
        'apods:hasStatus': expect.arrayContaining(['apods:Open', 'apods:Coming'])
      });
    });
  });

  test('Event is closed again because Alice changed the max attendees number', async () => {
    event['apods:maxAttendees'] = 3;

    await alice.call('events.event.put', {
      resourceUri: eventUri,
      resource: event,
      contentType: MIME_TYPES.JSON,
      webId: alice.id
    });

    await expect(
      alice.call('activitypub.object.get', { objectUri: eventUri, actorUri: alice.id })
    ).resolves.toMatchObject({
      'apods:hasStatus': expect.arrayContaining(['apods:Closed', 'apods:Coming'])
    });

    // This shouldn't have an impact
    await alice.call('events.status.tagComing');
    await alice.call('events.status.tagClosed');
    await alice.call('events.status.tagFinished');

    await expect(
      alice.call('activitypub.object.get', { objectUri: eventUri, actorUri: alice.id })
    ).resolves.toMatchObject({
      'apods:hasStatus': expect.arrayContaining(['apods:Closed', 'apods:Coming'])
    });
  });

  // TODO fix post-events contact sharing on multi-server mode
  if (mode === 'single-server') {
    test('Event is finished and contact requests are sent', async () => {
      const now = new Date();
      let startTime = new Date(now),
        endTime = new Date(now);
      startTime.setDate(now.getDate() - 2);
      endTime.setDate(now.getDate() - 1);

      event.startTime = startTime.toISOString();
      event.endTime = endTime.toISOString();

      await alice.call('events.event.put', {
        resourceUri: eventUri,
        resource: event,
        contentType: MIME_TYPES.JSON,
        webId: alice.id
      });

      await alice.call('events.status.tagComing');
      await alice.call('events.status.tagClosed');
      await alice.call('events.status.tagFinished');

      await expect(
        alice.call('activitypub.object.get', { objectUri: eventUri, actorUri: alice.id })
      ).resolves.toMatchObject({
        'apods:hasStatus': expect.arrayContaining(['apods:Closed', 'apods:Finished'])
      });

      // Daisy should receive two contact requests from Alice and Bob
      await waitForExpect(async () => {
        await expect(
          daisy.call('activitypub.collection.get', { collectionUri: daisy['apods:contactRequests'] })
        ).resolves.toMatchObject({
          items: expect.arrayContaining([
            expect.objectContaining({
              type: ACTIVITY_TYPES.OFFER,
              actor: alice.id
            }),
            expect.objectContaining({
              type: ACTIVITY_TYPES.OFFER,
              actor: bob.id
            })
          ]),
          totalItems: 2
        });
      });

      // Bob should only receive a contact request from Daisy (Alice is already in his contacts)
      await waitForExpect(async () => {
        await expect(
          bob.call('activitypub.collection.get', { collectionUri: bob['apods:contactRequests'] })
        ).resolves.toMatchObject({
          items: expect.objectContaining({
            type: ACTIVITY_TYPES.OFFER,
            actor: daisy.id
          }),
          totalItems: 1
        });
      });

      await waitForExpect(() => {
        expect(mockSendNotification).toHaveBeenCalledTimes(11);
      });

      expect(mockSendNotification.mock.calls[7][0].params.data.key).toBe('post_event_contact_request');
      expect(mockSendNotification.mock.calls[8][0].params.data.key).toBe('post_event_contact_request');
      expect(mockSendNotification.mock.calls[9][0].params.data.key).toBe('post_event_contact_request');
      expect(mockSendNotification.mock.calls[10][0].params.data.key).toBe('post_event_contact_request');
    }, 80000);

    test('Daisy silently accept Bob automatic contact requests', async () => {
      const { items: contactRequests } = await daisy.call('activitypub.collection.get', {
        collectionUri: daisy['apods:contactRequests']
      });

      const bobContactRequest = arrayOf(contactRequests).find(r => r.actor === bob.id);

      await daisy.call('activitypub.outbox.post', {
        collectionUri: daisy.outbox,
        type: ACTIVITY_TYPES.ACCEPT,
        actor: daisy.id,
        object: bobContactRequest.id,
        to: bob.id
      });

      await delay(5000);

      // Since this is a post-event contact add, no notification should be sent
      expect(mockSendNotification).not.toHaveBeenCalledTimes(12);
    });
  }

  test('Alice delete her event', async () => {
    await alice.call('events.event.delete', {
      resourceUri: eventUri
    });

    // The event is now a Tombstone
    // await waitForExpect(async () => {
    //   await expect(
    //     broker.call('ldp.resource.get', {
    //       resourceUri: eventUri,
    //       webId: alice.id,
    //     })
    //   ).resolves.toMatchObject({
    //     type: 'Tombstone',
    //     'as:formerType': 'Event',
    //   });
    // });

    // The event is removed from Alice container
    await waitForExpect(async () => {
      await expect(
        alice.call('ldp.container.get', {
          containerUri: alice.id + '/data/events'
        })
      ).resolves.not.toMatchObject({
        'ldp:contains': expect.arrayContaining([
          expect.objectContaining({
            id: eventUri
          })
        ])
      });
    });

    // The deletion is announced to all invitees
    await waitForExpect(async () => {
      // TODO new action to only get most recent item in collection
      const outbox = await alice.call('activitypub.collection.get', {
        collectionUri: alice.outbox,
        page: 1
      });
      await expect(arrayOf(outbox.orderedItems)[0]).toMatchObject({
        type: ACTIVITY_TYPES.ANNOUNCE,
        object: {
          type: ACTIVITY_TYPES.DELETE,
          object: eventUri
        },
        actor: alice.id,
        to: expect.arrayContaining([bob.id, craig.id, daisy.id])
      });
    });

    // The event is removed from Bob cache (and other invitees)
    await waitForExpect(async () => {
      await expect(
        bob.call('ldp.container.get', {
          containerUri: bob.id + '/data/events'
        })
      ).resolves.not.toMatchObject({
        'ldp:contains': expect.arrayContaining([
          expect.objectContaining({
            id: eventUri
          })
        ])
      });
    });
  });
});
