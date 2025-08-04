// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import { connectPodProvider, clearAllData, initializeAppServer, installApp } from './initialize.ts';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import ExampleAppService from './apps/example.app.ts';
// @ts-expect-error TS(2304): Cannot find name 'jest'.
jest.setTimeout(100000);
const NUM_PODS = 1;
const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');

// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('Test AS collections handling', () => {
  let actors: any = [],
    podProvider: any,
    alice: any,
    appServer: any,
    collectionUri: any;

  // @ts-expect-error TS(2304): Cannot find name 'beforeAll'.
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
      actors[i].call = (actionName: any, params: any, options = {}) =>
        podProvider.call(actionName, params, {
          ...options,
          // @ts-expect-error TS(2339): Property 'meta' does not exist on type '{}'.
          meta: { ...options.meta, webId, dataset: actors[i].preferredUsername }
        });
    }

    alice = actors[1];

    await installApp(alice, APP_URI);
  }, 100000);

  // @ts-expect-error TS(2304): Cannot find name 'afterAll'.
  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(collectionUri).not.toBeUndefined();

    const { body: collection } = await appServer.call('pod-resources.get', {
      resourceUri: collectionUri,
      actorUri: alice.id
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(collection).toMatchObject({
      type: 'Collection',
      summary: 'Friends list',
      'semapps:dereferenceItems': false,
      items: []
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
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

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(collection).toMatchObject({
      type: 'Collection',
      items: 'http://localhost:3000/bob'
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(collection).toMatchObject({
      type: 'Collection',
      items: []
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Delete collection', async () => {
    await appServer.call('pod-collections.deleteAndDetach', {
      resourceUri: alice.id,
      attachPredicate: 'http://activitypods.org/ns/core#friends',
      actorUri: alice.id
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
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
