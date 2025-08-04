import urlJoin from 'url-join';
import fetch from 'node-fetch';
import WebSocket from 'ws';
import { delay } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';
import { triple, namedNode, literal } from '@rdfjs/data-model';
import { connectPodProvider, clearAllData, initializeAppServer, installApp } from './initialize.ts';
import ExampleAppService from './apps/example.app.ts';
import { fetchServer, tryUntilTimeout } from './utils.ts';
jest.setTimeout(110_000);
const POD_SERVER_BASE_URL = 'http://localhost:3000';
const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');

describe('Websocket channel', () => {
  let podProvider: any, alice: any, appServer: any, webSocketChannelSubscriptionUrl: any;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
    await appServer.start();

    const actorData = require(`./data/actor1.json`);
    const { webId } = await podProvider.call('auth.signup', actorData);
    alice = await podProvider.call(
      'activitypub.actor.awaitCreateComplete',
      {
        actorUri: webId,
        additionalKeys: ['url']
      },
      { meta: { dataset: actorData.username } }
    );
    alice.call = (actionName: any, params: any, options = {}) =>
      podProvider.call(actionName, params, {
        ...options,
        meta: { ...options.meta, webId, dataset: alice.preferredUsername }
      });

    await installApp(alice, APP_URI);
  }, 110_000);

  afterAll(async () => {
    podProvider.stop();
    appServer.stop();
  });

  test('Websocket channel subscription is available', async () => {
    const { json: storage } = await fetchServer(urlJoin(POD_SERVER_BASE_URL, '.well-known/solid'));

    expect(storage.type).toBe('pim:Storage');
    expect(storage['notify:subscription']).toHaveLength(2);

    webSocketChannelSubscriptionUrl = storage['notify:subscription'].find((uri: any) =>
      uri.includes('/WebSocketChannel2023')
    );

    const { json: webSocketChannelSubscription } = await fetchServer(webSocketChannelSubscriptionUrl);

    expect(webSocketChannelSubscription).toMatchObject({
      'notify:channelType': 'notify:WebSocketChannel2023',
      'notify:feature': ['notify:endAt', 'notify:rate', 'notify:startAt', 'notify:state']
    });
  });

  test('Cannot create web socket channel without read rights', async () => {
    // Alice profile is not public
    const { status } = await fetchServer(webSocketChannelSubscriptionUrl, {
      method: 'POST',
      headers: new fetch.Headers({ 'Content-Type': 'application/ld+json' }),
      body: {
        '@context': {
          notify: 'http://www.w3.org/ns/solid/notifications#'
        },
        '@type': 'notify:WebSocketChannel2023',
        'notify:topic': alice.url
      }
    });

    expect(status).toBe(403);
  });

  test('Cannot create web socket channel for non-existing resources', async () => {
    const { status } = await fetchServer(webSocketChannelSubscriptionUrl, {
      method: 'POST',
      headers: new fetch.Headers({ 'Content-Type': 'application/ld+json' }),
      body: {
        '@context': {
          notify: 'http://www.w3.org/ns/solid/notifications#'
        },
        '@type': 'notify:WebSocketChannel2023',
        'notify:topic': `${alice.url}-unexisting`
      }
    });

    expect(status).toBe(400);
  });

  describe('collection and resource subscription', () => {
    let collectionUri: any,
      noteUri: any,
      collectionWebSocket: any,
      itemWebSocket: any,
      webSocketCollectionChannelUri: any,
      webSocketItemChannelUri: any;
    const collectionActivities: any = [];
    const itemActivities: any = [];

    beforeAll(async () => {
      collectionUri = await appServer.call('pod-collections.createAndAttach', {
        resourceUri: alice.id,
        attachPredicate: 'http://activitypods.org/ns/core#my-notes',
        collectionOptions: {
          ordered: false,
          summary: 'My notes',
          dereferenceItems: false
        },
        actorUri: alice.id
      });

      await alice.call('webacl.resource.addRights', {
        webId: 'system',
        resourceUri: urlJoin(alice.id, 'data/as'),
        additionalRights: {
          anon: {
            uri: APP_URI,
            read: true,
            write: true,
            append: true,
            control: true
          }
        }
      });

      noteUri = await alice.call('ldp.container.post', {
        containerUri: urlJoin(alice.id, 'data/as'),
        resource: {
          '@context': 'https://www.w3.org/ns/activitystreams',
          '@type': 'Note',
          name: `A new collection note`,
          content: `The note content.`
        },
        contentType: MIME_TYPES.JSON
      });
      await alice.call('webacl.resource.addRights', {
        webId: 'system',
        resourceUri: noteUri,
        additionalRights: {
          anon: {
            uri: APP_URI,
            read: true,
            write: true,
            append: true,
            control: true
          }
        }
      });
    });

    test('Create web socket channels as registered app', async () => {
      // Create channel for listing to collection changes.

      const { body: collectionChannelBody } = await appServer.call('signature.proxy.query', {
        url: webSocketChannelSubscriptionUrl,
        method: 'POST',
        headers: new fetch.Headers({ 'Content-Type': 'application/ld+json' }),
        body: JSON.stringify({
          '@context': {
            notify: 'http://www.w3.org/ns/solid/notifications#'
          },
          '@type': 'notify:WebSocketChannel2023',
          'notify:topic': collectionUri
        }),
        actorUri: APP_URI
      });
      expect(collectionChannelBody.id).toBeTruthy();
      webSocketCollectionChannelUri = collectionChannelBody.id;

      collectionWebSocket = new WebSocket(collectionChannelBody['notify:receiveFrom']);
      collectionWebSocket.addEventListener('message', (e: any) => {
        collectionActivities.push(JSON.parse(e.data));
      });

      const { body: itemChannelBody } = await appServer.call('signature.proxy.query', {
        url: webSocketChannelSubscriptionUrl,
        method: 'POST',
        headers: new fetch.Headers({ 'Content-Type': 'application/ld+json' }),
        body: JSON.stringify({
          '@context': {
            notify: 'http://www.w3.org/ns/solid/notifications#'
          },
          '@type': 'notify:WebSocketChannel2023',
          'notify:topic': noteUri
        }),
        actorUri: APP_URI
      });
      expect(itemChannelBody.id).toBeTruthy();
      webSocketItemChannelUri = itemChannelBody.id;

      itemWebSocket = new WebSocket(itemChannelBody['notify:receiveFrom']);
      itemWebSocket.addEventListener('message', (e: any) => {
        itemActivities.push(JSON.parse(e.data));
      });
    });

    test('add', async () => {
      await alice.call('activitypub.collection.add', {
        collectionUri,
        item: noteUri
      });

      await tryUntilTimeout(() => {
        expect(collectionActivities[collectionActivities.length - 1]).toMatchObject({
          '@context': ['https://www.w3.org/ns/activitystreams', 'https://www.w3.org/ns/solid/notifications-context/v1'],
          type: 'Add',
          object: noteUri,
          target: collectionUri
        });
      }, 10_000);
    });

    test('patch', async () => {
      await alice.call('ldp.resource.patch', {
        resourceUri: noteUri,
        triplesToAdd: [
          triple(namedNode(noteUri), namedNode('https://www.w3.org/ns/activitystreams#tag'), literal('My tag'))
        ]
      });

      await tryUntilTimeout(() => {
        expect(itemActivities[itemActivities.length - 1]).toMatchObject({
          type: 'Update',
          object: noteUri
        });
      }, 10_000);
    });

    test('delete', async () => {
      await alice.call('ldp.resource.delete', {
        resourceUri: noteUri,
        webId: 'system'
      });

      await tryUntilTimeout(() => {
        expect(itemActivities[itemActivities.length - 1]).toMatchObject({
          type: 'Delete',
          object: noteUri
        });
      }, 10_000);
      // Item is replaced by tombstone, and not removed.
      await tryUntilTimeout(() => {
        expect(collectionActivities[collectionActivities.length - 1]).not.toMatchObject({
          type: 'Remove',
          object: noteUri,
          target: collectionUri
        });
      }, 10_000);

      await alice.call('activitypub.collection.remove', { collectionUri: collectionUri, itemUri: noteUri });
      // Now the tombstone should be gone.
      await tryUntilTimeout(() => {
        expect(collectionActivities[collectionActivities.length - 1]).toMatchObject({
          type: 'Remove',
          object: noteUri,
          target: collectionUri
        });
      }, 10_000);
    });

    test('Delete web socket channels', async () => {
      const responseDelCollection = await appServer.call('signature.proxy.query', {
        url: webSocketCollectionChannelUri,
        method: 'DELETE',
        actorUri: APP_URI
      });
      const responseDelItem = await appServer.call('signature.proxy.query', {
        url: webSocketItemChannelUri,
        method: 'DELETE',
        actorUri: APP_URI
      });
      expect(responseDelCollection.status).toBe(204);
      expect(responseDelItem.status).toBe(204);
      await delay(3_000);
      expect(collectionWebSocket.readyState).toBe(WebSocket.CLOSED);
      expect(itemWebSocket.readyState).toBe(WebSocket.CLOSED);
    });
  });

  describe('container subscription', () => {
    let containerUri: any, resourceUri: any, containerWebSocket;
    const containerActivities: any = [];

    beforeAll(async () => {
      containerUri = urlJoin(alice.id, 'data/as');
      await alice.call('webacl.resource.addRights', {
        webId: 'system',
        resourceUri: containerUri,
        additionalRights: {
          anon: {
            uri: APP_URI,
            read: true,
            write: true,
            append: true,
            control: true
          }
        }
      });
    });

    test('Create web socket channel as registered app', async () => {
      const { body } = await appServer.call('signature.proxy.query', {
        url: webSocketChannelSubscriptionUrl,
        method: 'POST',
        headers: new fetch.Headers({ 'Content-Type': 'application/ld+json' }),
        body: JSON.stringify({
          '@context': {
            notify: 'http://www.w3.org/ns/solid/notifications#'
          },
          '@type': 'notify:WebSocketChannel2023',
          'notify:topic': containerUri
        }),
        actorUri: APP_URI
      });
      expect(body.id).toBeTruthy();

      containerWebSocket = new WebSocket(body['notify:receiveFrom']);
      containerWebSocket.addEventListener('message', (e: any) => {
        containerActivities.push(JSON.parse(e.data));
      });
    });

    test('add', async () => {
      resourceUri = await alice.call('ldp.container.post', {
        containerUri,
        resource: {
          '@context': 'https://www.w3.org/ns/activitystreams',
          '@type': 'Object',
          name: `Some object resource`,
          content: `I'm a resource with type as:Object.`
        },
        contentType: MIME_TYPES.JSON
      });

      await tryUntilTimeout(() => {
        expect(containerActivities[containerActivities.length - 1]).toMatchObject({
          '@context': ['https://www.w3.org/ns/activitystreams', 'https://www.w3.org/ns/solid/notifications-context/v1'],
          type: 'Add',
          object: resourceUri,
          target: containerUri
        });
      }, 10_000);
    });

    test('delete', async () => {
      await alice.call('ldp.resource.delete', {
        resourceUri: resourceUri,
        webId: 'system'
      });

      await tryUntilTimeout(() => {
        expect(containerActivities[containerActivities.length - 1]).toMatchObject({
          type: 'Remove',
          object: resourceUri,
          target: containerUri
        });
      }, 10_000);
    });
  });
});
