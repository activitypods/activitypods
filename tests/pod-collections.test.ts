import { ServiceBroker } from 'moleculer';
import { connectPodProvider, clearAllData, initializeAppServer, installApp, createAccount } from './initialize.ts';
import ExampleAppService from './apps/example.app.ts';

jest.setTimeout(100000);

describe('Test AS collections handling', () => {
  let podProvider: ServiceBroker, alice: any, app: any, collectionUri: any;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    app = await initializeAppServer(3001, 'app', 'app_settings', 1, ExampleAppService);

    alice = await createAccount(podProvider, 'alice');

    await installApp(alice, app.id);
  }, 100000);

  afterAll(async () => {
    await podProvider.stop();
    await app.stop();
  });

  test('Attach a collection to Alice actor', async () => {
    collectionUri = await app.call('pod-collections.createAndAttach', {
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

    const { body: collection } = await app.call('pod-resources.get', {
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
      app.call('pod-resources.get', {
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
    await app.call('pod-collections.add', {
      collectionUri,
      itemUri: 'http://localhost:3000/bob',
      actorUri: alice.id
    });

    const { body: collection } = await app.call('pod-resources.get', {
      resourceUri: collectionUri,
      actorUri: alice.id
    });

    expect(collection).toMatchObject({
      type: 'Collection',
      items: 'http://localhost:3000/bob'
    });
  });

  test('Remove item from collection', async () => {
    await app.call('pod-collections.remove', {
      collectionUri,
      itemUri: 'http://localhost:3000/bob',
      actorUri: alice.id
    });

    const { body: collection } = await app.call('pod-resources.get', {
      resourceUri: collectionUri,
      actorUri: alice.id
    });

    expect(collection).toMatchObject({
      type: 'Collection',
      items: []
    });
  });

  test('Delete collection', async () => {
    await app.call('pod-collections.deleteAndDetach', {
      resourceUri: alice.id,
      attachPredicate: 'http://activitypods.org/ns/core#friends',
      actorUri: alice.id
    });

    await expect(
      app.call('pod-resources.get', {
        resourceUri: collectionUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      status: 404
    });
  });
});
