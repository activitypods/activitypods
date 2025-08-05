import urlJoin from 'url-join';
import { MIME_TYPES } from '@semapps/mime-types';
import { connectPodProvider, clearAllData, installApp, initializeAppServer } from './initialize.ts';
import ExampleAppService from './apps/example.app.ts';
import Example2AppService from './apps/example2.app.ts';
import { OBJECT_TYPES, ACTIVITY_TYPES } from '@semapps/activitypub';
jest.setTimeout(120000);
const NUM_PODS = 1;
const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');
const APP2_SERVER_BASE_URL = 'http://localhost:3002';
const APP2_URI = urlJoin(APP2_SERVER_BASE_URL, 'app');

describe('Test Pod outbox posting', () => {
  let actors = [],
    podProvider,
    alice,
    appServer,
    app2Server,
    noteUri;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
    await appServer.start();

    app2Server = await initializeAppServer(3002, 'app2Data', 'app2_settings', 2, Example2AppService);
    await app2Server.start();

    for (let i = 1; i <= NUM_PODS; i++) {
      const actorData = require(`./data/actor${i}.json`);
      const { webId } = await podProvider.call('auth.signup', actorData);
      actors[i] = await podProvider.call(
        'activitypub.actor.awaitCreateComplete',
        {
          actorUri: webId,
          additionalKeys: ['url']
        },
        { meta: { dataset: actorData.username } }
      );
      actors[i].call = (actionName, params, options = {}) =>
        podProvider.call(actionName, params, {
          ...options,
          meta: { ...options.meta, webId, dataset: actors[i].preferredUsername }
        });
    }

    alice = actors[1];

    await installApp(alice, APP_URI);
    await installApp(alice, APP2_URI);
  }, 120000);

  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
    await app2Server.stop();
  });

  test('Post activity as user', async () => {
    const activityUri = await appServer.call('pod-outbox.post', {
      activity: {
        type: ACTIVITY_TYPES.LIKE,
        object: alice.id,
        summary: 'Liking yourself is good'
      },
      actorUri: alice.id
    });

    expect(activityUri).toMatch(alice.id);

    // Generator has been added
    await expect(
      appServer.call('pod-resources.get', {
        resourceUri: activityUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      body: {
        type: ACTIVITY_TYPES.LIKE,
        actor: alice.id,
        object: alice.id,
        summary: 'Liking yourself is good',
        generator: APP_URI
      }
    });
  });

  test('Post activity as user without permission', async () => {
    // App2 did not request apods:PostOutbox permission
    await expect(
      app2Server.call('pod-outbox.post', {
        activity: {
          type: ACTIVITY_TYPES.LIKE,
          object: alice.id,
          summary: 'Liking yourself is good'
        },
        actorUri: alice.id
      })
    ).resolves.toBe(false);
  });

  test('Create a resource for which I have write permission', async () => {
    const activityUri = await appServer.call('pod-outbox.post', {
      activity: {
        type: ACTIVITY_TYPES.CREATE,
        object: {
          type: OBJECT_TYPES.EVENT,
          name: 'Birthday party'
        }
      },
      actorUri: alice.id
    });

    expect(activityUri).toMatch(alice.id);

    const { body: activity } = await appServer.call('pod-resources.get', {
      resourceUri: activityUri,
      actorUri: alice.id
    });

    expect(activity).toMatchObject({
      type: ACTIVITY_TYPES.CREATE,
      object: {
        type: OBJECT_TYPES.EVENT,
        name: 'Birthday party'
      },
      generator: APP_URI
    });

    expect(activity.object.id).not.toBeUndefined();

    const { body: event } = await appServer.call('pod-resources.get', {
      resourceUri: activity.object.id,
      actorUri: alice.id
    });

    expect(event).toMatchObject({
      type: OBJECT_TYPES.EVENT,
      name: 'Birthday party'
    });
  });

  test('Create a resource for which app has no write permission', async () => {
    await expect(
      appServer.call('pod-outbox.post', {
        activity: {
          type: ACTIVITY_TYPES.CREATE,
          object: {
            type: OBJECT_TYPES.PLACE,
            name: 'My place'
          }
        },
        actorUri: alice.id
      })
    ).resolves.toBe(false);
  });

  test('Update a resource for which app has no write permission', async () => {
    await alice.call('ldp.registry.register', {
      acceptedTypes: 'as:Note'
    });

    noteUri = await alice.call('ldp.container.post', {
      containerUri: urlJoin(alice.id, 'data/as/note'),
      resource: {
        type: OBJECT_TYPES.NOTE,
        name: 'Note to myself'
      },
      contentType: MIME_TYPES.JSON
    });

    await expect(
      appServer.call('pod-outbox.post', {
        activity: {
          type: ACTIVITY_TYPES.UPDATE,
          object: {
            id: noteUri,
            type: OBJECT_TYPES.NOTE,
            name: 'Note to myself .. and my hackers !'
          }
        },
        actorUri: alice.id
      })
    ).resolves.toBe(false);
  });

  test('Update a resource which does not exist', async () => {
    await expect(
      appServer.call('pod-outbox.post', {
        activity: {
          type: ACTIVITY_TYPES.UPDATE,
          object: {
            id: alice.id + '/data/as/place/does-not-exist',
            type: OBJECT_TYPES.PLACE,
            name: 'My place'
          }
        },
        actorUri: alice.id
      })
    ).resolves.toBe(false);
  });

  test('Delete a resource for which app has no write permission', async () => {
    await expect(
      appServer.call('pod-outbox.post', {
        activity: {
          type: ACTIVITY_TYPES.DELETE,
          object: noteUri
        },
        actorUri: alice.id
      })
    ).resolves.toBe(false);
  });
});
