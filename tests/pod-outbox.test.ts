// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import { MIME_TYPES } from '@semapps/mime-types';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import { connectPodProvider, clearAllData, installApp, initializeAppServer } from './initialize.ts';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import ExampleAppService from './apps/example.app.ts';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import Example2AppService from './apps/example2.app.ts';
// @ts-expect-error TS(2305): Module '"@semapps/activitypub"' has no exported me... Remove this comment to see the full error message
import { OBJECT_TYPES, ACTIVITY_TYPES } from '@semapps/activitypub';
// @ts-expect-error TS(2304): Cannot find name 'jest'.
jest.setTimeout(120000);
const NUM_PODS = 1;
const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');
const APP2_SERVER_BASE_URL = 'http://localhost:3002';
const APP2_URI = urlJoin(APP2_SERVER_BASE_URL, 'app');

// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('Test Pod outbox posting', () => {
  let actors: any = [],
    podProvider: any,
    alice: any,
    appServer: any,
    app2Server: any,
    noteUri: any;

  // @ts-expect-error TS(2304): Cannot find name 'beforeAll'.
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
      actors[i].call = (actionName: any, params: any, options = {}) =>
        podProvider.call(actionName, params, {
          ...options,
          // @ts-expect-error TS(2339): Property 'meta' does not exist on type '{}'.
          meta: { ...options.meta, webId, dataset: actors[i].preferredUsername }
        });
    }

    alice = actors[1];

    await installApp(alice, APP_URI);
    await installApp(alice, APP2_URI);
  }, 120000);

  // @ts-expect-error TS(2304): Cannot find name 'afterAll'.
  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
    await app2Server.stop();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Post activity as user', async () => {
    const activityUri = await appServer.call('pod-outbox.post', {
      activity: {
        type: ACTIVITY_TYPES.LIKE,
        object: alice.id,
        summary: 'Liking yourself is good'
      },
      actorUri: alice.id
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(activityUri).toMatch(alice.id);

    // Generator has been added
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
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

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Post activity as user without permission', async () => {
    // App2 did not request apods:PostOutbox permission
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
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

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(activityUri).toMatch(alice.id);

    const { body: activity } = await appServer.call('pod-resources.get', {
      resourceUri: activityUri,
      actorUri: alice.id
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(activity).toMatchObject({
      type: ACTIVITY_TYPES.CREATE,
      object: {
        type: OBJECT_TYPES.EVENT,
        name: 'Birthday party'
      },
      generator: APP_URI
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(activity.object.id).not.toBeUndefined();

    const { body: event } = await appServer.call('pod-resources.get', {
      resourceUri: activity.object.id,
      actorUri: alice.id
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(event).toMatchObject({
      type: OBJECT_TYPES.EVENT,
      name: 'Birthday party'
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Create a resource for which app has no write permission', async () => {
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
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

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
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

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Update a resource which does not exist', async () => {
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
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

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Delete a resource for which app has no write permission', async () => {
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
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
