import { ServiceBroker } from 'moleculer';
import {
  connectPodProvider,
  clearAllData,
  installApp,
  initializeAppServer,
  createTestActor,
  getTestApp
} from './initialize.ts';
import ExampleAppService from './apps/example.app.ts';
import Example2AppService from './apps/example2.app.ts';
import { OBJECT_TYPES, ACTIVITY_TYPES } from '@semapps/activitypub';
import { TestActor, TestApp } from './utilTypes.js';

jest.setTimeout(120000);

describe('Test Pod outbox posting', () => {
  let podProvider: ServiceBroker,
    appServer: ServiceBroker,
    app2Server: ServiceBroker,
    alice: TestActor,
    app: TestApp,
    app2: TestApp,
    notesContainerUri: string,
    noteUri: string;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();
    alice = await createTestActor(podProvider, 'alice');

    appServer = await initializeAppServer(3001, 'app', 'app_settings', 1, ExampleAppService);
    await appServer.start();
    app = await getTestApp(appServer);

    app2Server = await initializeAppServer(3002, 'app2', 'app2_settings', 2, Example2AppService);
    await app2Server.start();
    app2 = await getTestApp(app2Server);

    await installApp(alice, app.id);
    await installApp(alice, app2.id);
  }, 120000);

  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
    await app2Server.stop();
  });

  test('Post activity as user', async () => {
    const activityUri = await app.call('pod-outbox.post', {
      activity: {
        type: ACTIVITY_TYPES.LIKE,
        object: alice.id,
        summary: 'Liking yourself is good'
      },
      actorUri: alice.id
    });

    expect(activityUri).toBeDefined();

    // Generator has been added
    await expect(
      app.call('pod-resources.get', {
        resourceUri: activityUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      body: {
        type: ACTIVITY_TYPES.LIKE,
        actor: alice.id,
        object: alice.id,
        summary: 'Liking yourself is good',
        generator: app.id
      }
    });
  });

  test('Post activity as user without permission', async () => {
    // App2 did not request apods:PostOutbox permission
    await expect(
      app2.call('pod-outbox.post', {
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
    const activityUri = await app.call('pod-outbox.post', {
      activity: {
        type: ACTIVITY_TYPES.CREATE,
        object: {
          type: OBJECT_TYPES.EVENT,
          name: 'Birthday party'
        }
      },
      actorUri: alice.id
    });

    expect(activityUri).toBeDefined();

    const { body: activity } = await app.call('pod-resources.get', {
      resourceUri: activityUri,
      actorUri: alice.id
    });

    expect(activity).toMatchObject({
      type: ACTIVITY_TYPES.CREATE,
      object: {
        type: OBJECT_TYPES.EVENT,
        name: 'Birthday party'
      },
      generator: app.id
    });

    expect(activity.object.id).not.toBeUndefined();

    const { body: event } = await app.call('pod-resources.get', {
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
      app.call('pod-outbox.post', {
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
      types: 'as:Note'
    });

    notesContainerUri = await alice.getContainerUri('as:Note');

    noteUri = await alice.call('ldp.container.post', {
      containerUri: notesContainerUri,
      resource: {
        type: OBJECT_TYPES.NOTE,
        name: 'Note to myself'
      }
    });

    await expect(
      app.call('pod-outbox.post', {
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
      app.call('pod-outbox.post', {
        activity: {
          type: ACTIVITY_TYPES.UPDATE,
          object: {
            id: alice.baseUrl + '/as/place/does-not-exist',
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
      app.call('pod-outbox.post', {
        activity: {
          type: ACTIVITY_TYPES.DELETE,
          object: noteUri
        },
        actorUri: alice.id
      })
    ).resolves.toBe(false);
  });
});
