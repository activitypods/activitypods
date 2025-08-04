import urlJoin from 'url-join';
import { connectPodProvider, clearAllData, initializeAppServer, installApp } from './initialize.ts';
import ExampleAppService from './apps/example.app.ts';
jest.setTimeout(100000);
const NUM_PODS = 1;
const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');

describe('Test AS collections handling', () => {
  let actors = [],
    podProvider,
    alice,
    appServer,
    collectionUri;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
    await appServer.start();

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
  }, 100000);

  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
  });

  test('Attach a collection to Alice actor', async () => {
    collectionUri = await appServer.call('pod-collections.createAndAttach', {
      resourceUri: alice.id,
      attachPredicate: 'http://activitypods.org/ns/core#friends',
      collectionOptions: {
        ordered: false,
        summary: 'Friends list',
        dereferenceItems: false
      },
      actorUri: alice.id
    });

    expect(collectionUri).not.toBeUndefined();

    const { body: collection } = await appServer.call('pod-resources.get', {
      resourceUri: collectionUri,
      actorUri: alice.id
    });

    expect(collection).toMatchObject({
      type: 'Collection',
      summary: 'Friends list',
      'semapps:dereferenceItems': false,
      items: []
    });

    await expect(
      appServer.call('pod-resources.get', {
        resourceUri: alice.id,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      body: {
        // Since this predicate is not defined in the JSON-LD context, it is an object
        'apods:friends': {
          id: collectionUri
        }
      }
    });
  });

  test('Add item to collection', async () => {
    await appServer.call('pod-collections.add', {
      collectionUri,
      itemUri: 'http://localhost:3000/bob',
      actorUri: alice.id
    });

    const { body: collection } = await appServer.call('pod-resources.get', {
      resourceUri: collectionUri,
      actorUri: alice.id
    });

    expect(collection).toMatchObject({
      type: 'Collection',
      items: 'http://localhost:3000/bob'
    });
  });

  test('Remove item from collection', async () => {
    await appServer.call('pod-collections.remove', {
      collectionUri,
      itemUri: 'http://localhost:3000/bob',
      actorUri: alice.id
    });

    const { body: collection } = await appServer.call('pod-resources.get', {
      resourceUri: collectionUri,
      actorUri: alice.id
    });

    expect(collection).toMatchObject({
      type: 'Collection',
      items: []
    });
  });

  test('Delete collection', async () => {
    await appServer.call('pod-collections.deleteAndDetach', {
      resourceUri: alice.id,
      attachPredicate: 'http://activitypods.org/ns/core#friends',
      actorUri: alice.id
    });

    await expect(
      appServer.call('pod-resources.get', {
        resourceUri: collectionUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      status: 404
    });
  });
});
