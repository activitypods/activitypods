const waitForExpect = require('wait-for-expect');
const { ACTIVITY_TYPES, OBJECT_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const initialize = require('./initialize');
const path = require('path');
const urlJoin = require('url-join');

jest.setTimeout(30000);

let broker;

const mockSendNotification = jest.fn(() => Promise.resolve());

const NUM_ACTORS = 20;

beforeAll(async () => {
  broker = await initialize();

  await broker.loadService(path.resolve(__dirname, './services/core.service.js'));
  await broker.loadService(path.resolve(__dirname, './services/announcer.service.js'));
  await broker.loadService(path.resolve(__dirname, './services/profiles.app.js'));
  await broker.loadService(path.resolve(__dirname, './services/contacts.app.js'));
  await broker.loadService(path.resolve(__dirname, './services/events.app.js'));

  // Mock notification service
  await broker.createService({
    mixins: [require('./services/notification.service')],
    actions: {
      send: mockSendNotification,
    },
  });

  await broker.start();
});

afterAll(async () => {
  await broker.stop();
});

describe('Test mass sharing', () => {
  let actors = [], actorsUris = [];

  test(`Create ${NUM_ACTORS} users`, async () => {
    for (let i = 1; i <= NUM_ACTORS; i++) {
      console.log(`Creating User #${i}...`)

      const { webId } = await broker.call('auth.signup', {
        username: `user${i}`,
        email: `user${i}@test.com`,
        password: "test",
        name: `User #${i}`
      });

      // actorsUris[i] = urlJoin(CONFIG.HOME_URL, `user${i}`);
      actorsUris[i] = webId;

      // actors[i] = await broker.call('activitypub.actor.awaitCreateComplete', {
      //   actorUri: webId,
      //   additionalKeys: ['url', 'apods:contacts', 'apods:contactRequests', 'apods:rejectedContacts'],
      // });
      //
      // expect(actors[i].preferredUsername).toBe(`user${i}`);
    }
  }, 300000);

  test('User #1 announce his event to all other users', async () => {
    const eventUri = await broker.call('events.event.post', {
      containerUri: urlJoin(actorsUris[1], 'data/events'),
      resource: {
        type: OBJECT_TYPES.EVENT,
        name: 'Mass party !!',
      },
      contentType: MIME_TYPES.JSON,
      webId: actorsUris[1],
    });

    const recipients = actorsUris.filter(uri => uri !== actorsUris[1]);

    await broker.call('activitypub.outbox.post', {
      collectionUri: urlJoin(actorsUris[1], 'outbox'),
      type: ACTIVITY_TYPES.ANNOUNCE,
      actor: actorsUris[1],
      object: eventUri,
      target: [recipients],
      to: [recipients],
    });

    for (let i = 2; i <= NUM_ACTORS; i++) {
      console.log(`Testing User #${i}`);
      await waitForExpect(async () => {
        await expect(
          broker.call('ldp.container.includes', {
            containerUri: urlJoin(actorsUris[i], '/data/events'),
            resourceUri: eventUri,
            webId: 'system',
          })
        ).resolves.toBeTruthy();
      }, 90000);
    }
  }, 400000);
});
