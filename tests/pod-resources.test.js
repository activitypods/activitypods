const path = require('path');
const urlJoin = require('url-join');
const { MIME_TYPES } = require('@semapps/mime-types');
const { initialize, initializeAppServer, clearDataset, listDatasets, installApp } = require('./initialize');
const ExampleAppService = require('./apps/example.app');

jest.setTimeout(80000);

const NUM_PODS = 2;

const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');

describe('Test app installation', () => {
  let actors = [],
    podServer,
    alice,
    bob,
    appServer,
    aliceEventUri,
    bobEventUri,
    bobNoteUri;

  beforeAll(async () => {
    const datasets = await listDatasets();
    for (let dataset of datasets) {
      await clearDataset(dataset);
    }

    podServer = await initialize(3000, 'settings');
    await podServer.loadService(path.resolve(__dirname, './services/profiles.app.js'));
    await podServer.start();

    appServer = await initializeAppServer(3001, 'app_settings');
    await appServer.createService(ExampleAppService);
    await appServer.start();

    for (let i = 1; i <= NUM_PODS; i++) {
      const actorData = require(`./data/actor${i}.json`);
      const { webId } = await podServer.call('auth.signup', actorData);
      actors[i] = await podServer.call(
        'activitypub.actor.awaitCreateComplete',
        {
          actorUri: webId,
          additionalKeys: ['url']
        },
        { meta: { dataset: actorData.username } }
      );
      actors[i].call = (actionName, params, options = {}) =>
        podServer.call(actionName, params, {
          ...options,
          meta: { ...options.meta, webId, dataset: actors[i].preferredUsername }
        });
    }

    alice = actors[1];
    bob = actors[2];

    await installApp(alice, APP_URI);
    await installApp(bob, APP_URI);
  }, 80000);

  afterAll(async () => {
    await podServer.stop();
    await appServer.stop();
  });

  test('Get local data through app', async () => {
    aliceEventUri = await alice.call('ldp.container.post', {
      containerUri: urlJoin(alice.id, 'data/as/event'),
      resource: {
        type: 'Event',
        name: 'Birthday party !'
      },
      contentType: MIME_TYPES.JSON
    });

    await expect(
      appServer.call('pod-resources.get', {
        resourceUri: aliceEventUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      type: 'Event',
      name: 'Birthday party !'
    });
  });

  test('Get remote data through app', async () => {
    bobEventUri = await bob.call('ldp.container.post', {
      containerUri: urlJoin(bob.id, 'data/as/event'),
      resource: {
        type: 'Event',
        name: 'Vegan barbecue'
      },
      contentType: MIME_TYPES.JSON
    });

    // Alice hasn't right (yet) to see Bob event
    await expect(
      appServer.call('pod-resources.get', {
        resourceUri: bobEventUri,
        actorUri: alice.id
      })
    ).rejects.toThrow();

    await bob.call('webacl.resource.addRights', {
      resourceUri: bobEventUri,
      additionalRights: {
        user: {
          uri: alice.id,
          read: true
        }
      },
      contentType: MIME_TYPES.JSON
    });

    await expect(
      appServer.call('pod-resources.get', {
        resourceUri: bobEventUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      type: 'Event',
      name: 'Vegan barbecue'
    });
  });

  test('Cannot get data not registered by app', async () => {
    await bob.call('ldp.registry.register', {
      acceptedTypes: 'as:Note'
    });

    bobNoteUri = await bob.call('ldp.container.post', {
      containerUri: urlJoin(bob.id, 'data/as/note'),
      resource: {
        type: 'Note',
        name: 'Note to myself'
      },
      contentType: MIME_TYPES.JSON
    });

    await bob.call('webacl.resource.addRights', {
      resourceUri: bobNoteUri,
      additionalRights: {
        user: {
          uri: alice.id,
          read: true
        }
      },
      contentType: MIME_TYPES.JSON
    });

    // Bob's note is shared with Alice, but the app has not registered as:Note
    await expect(
      appServer.call('pod-resources.get', {
        resourceUri: bobNoteUri,
        actorUri: alice.id
      })
    ).rejects.toThrow();
  });

  test('Cannot POST data not registered by app', async () => {
    await bob.call('webacl.resource.addRights', {
      resourceUri: bobNoteUri,
      additionalRights: {
        user: {
          uri: alice.id,
          write: true
        }
      },
      contentType: MIME_TYPES.JSON
    });

    // Bob gave write permission to Alice, but the app has not registered as:Note
    await expect(
      appServer.call('pod-resources.post', {
        resource: {
          type: 'Note',
          name: 'Note to myself... and my friends !'
        },
        actorUri: alice.id
      })
    ).rejects.toThrow();
  });

  test('POST data registered by app', async () => {
    await bob.call('webacl.resource.addRights', {
      resourceUri: bobEventUri,
      additionalRights: {
        user: {
          uri: alice.id,
          write: true
        }
      },
      contentType: MIME_TYPES.JSON
    });

    await expect(
      appServer.call('pod-resources.post', {
        resource: {
          type: 'Event',
          name: 'Vegan (and vegetarian) barbecue'
        },
        actorUri: alice.id
      })
    ).rejects.toThrow();
  });
});
