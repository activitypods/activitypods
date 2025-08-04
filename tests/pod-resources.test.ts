// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import { MIME_TYPES } from '@semapps/mime-types';
import { triple, namedNode, literal } from '@rdfjs/data-model';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import { connectPodProvider, clearAllData, initializeAppServer, installApp } from './initialize.ts';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import ExampleAppService from './apps/example.app.ts';
// @ts-expect-error TS(2304): Cannot find name 'jest'.
jest.setTimeout(80000);
const NUM_PODS = 2;
const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');

// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('Test Pod resources handling', () => {
  let actors: any = [],
    podProvider: any,
    alice: any,
    bob: any,
    appServer: any,
    aliceEventUri,
    bobEventUri: any,
    bobNoteUri: any;

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
    bob = actors[2];

    await installApp(alice, APP_URI);
    await installApp(bob, APP_URI);
  }, 120000);

  // @ts-expect-error TS(2304): Cannot find name 'afterAll'.
  afterAll(async () => {
    await appServer.stop();
    await podProvider.stop();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Get local data through app', async () => {
    aliceEventUri = await alice.call('ldp.container.post', {
      containerUri: urlJoin(alice.id, 'data/as/event'),
      resource: {
        type: 'Event',
        name: 'Birthday party !'
      },
      contentType: MIME_TYPES.JSON
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-resources.get', {
        resourceUri: aliceEventUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      body: {
        type: 'Event',
        name: 'Birthday party !'
      }
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-resources.get', {
        resourceUri: bobEventUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      status: 403
    });

    await bob.call('webacl.resource.addRights', {
      resourceUri: bobEventUri,
      additionalRights: {
        user: {
          uri: alice.id,
          read: true
        }
      }
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-resources.get', {
        resourceUri: bobEventUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      body: {
        type: 'Event',
        name: 'Vegan barbecue'
      }
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Cannot post to non-container', async () => {
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-resources.post', {
        resource: {
          id: alice.id + '/sparql',
          hackMe: 'if you can ?'
        },
        actorUri: alice.id
      })
    ).rejects.toThrow();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-resources.get', {
        resourceUri: bobNoteUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      status: 403
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('PUT data registered by app', async () => {
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

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-resources.put', {
        resource: {
          id: bobEventUri,
          type: 'Event',
          name: 'Vegan (and vegetarian) barbecue'
        },
        actorUri: alice.id
      })
    ).resolves.not.toThrow();

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-resources.get', {
        resourceUri: bobEventUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      body: {
        type: 'Event',
        name: 'Vegan (and vegetarian) barbecue'
      }
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Cannot PUT data not registered by app', async () => {
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
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-resources.put', {
        resource: {
          id: bobNoteUri,
          type: 'Note',
          name: 'Note to myself... and my friends !'
        },
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      status: 403
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('PATCH data registered by app', async () => {
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-resources.patch', {
        resourceUri: bobEventUri,
        triplesToAdd: [
          triple(
            namedNode(bobEventUri),
            namedNode('https://www.w3.org/ns/activitystreams#summary'),
            literal('A super-powerful AI-generated summary')
          )
        ],
        actorUri: alice.id
      })
    ).resolves.not.toThrow();

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-resources.get', {
        resourceUri: bobEventUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      body: {
        type: 'Event',
        name: 'Vegan (and vegetarian) barbecue',
        summary: 'A super-powerful AI-generated summary'
      }
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('DELETE data registered by app', async () => {
    // Alice has write permission on Bob's event
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-resources.delete', {
        resourceUri: bobEventUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      status: 204
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      appServer.call('pod-resources.get', {
        resourceUri: bobEventUri,
        actorUri: alice.id
      })
    ).resolves.toMatchObject({
      body: {
        type: 'Tombstone',
        formerType: 'as:Event'
      }
    });
  });
});
