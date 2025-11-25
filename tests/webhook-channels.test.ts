import urlJoin from 'url-join';
import fetch from 'node-fetch';
import { ServiceBroker } from 'moleculer';
import {
  connectPodProvider,
  clearAllData,
  initializeAppServer,
  installApp,
  createTestActor,
  getTestApp
} from './initialize.ts';
import ExampleAppService from './apps/example.app.ts';
import { parseHeader, negotiateContentType, parseRawBody, parseJson } from '@semapps/middlewares';
import { fetchServer, tryUntilTimeout } from './utils.ts';
import { delay } from '@semapps/ldp';
import { TestActor, TestApp } from './utilTypes.js';

jest.setTimeout(110_000);

const POD_SERVER_BASE_URL = 'http://localhost:3000';
const APP_SERVER_BASE_URL = 'http://localhost:3001';
const mockWebhookAction = jest.fn(() => Promise.resolve());
const mockWebhookAction2 = jest.fn(() => Promise.resolve());

describe('Test app installation', () => {
  let podProvider: ServiceBroker,
    appServer: ServiceBroker,
    alice: TestActor,
    app: TestApp,
    webhookChannelSubscriptionUrl: string,
    webhookChannelUri: string;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'app', 'app_settings', 1, ExampleAppService);
    appServer.createService({
      name: 'fake-service',
      actions: { webhook: mockWebhookAction, webhook2: mockWebhookAction2 }
    });
    await appServer.start();
    await appServer.call('api.addRoute', {
      route: {
        path: '/fake-webhook',
        authorization: false,
        authentication: false,
        aliases: {
          'POST /': [parseHeader, negotiateContentType, parseRawBody, parseJson, 'fake-service.webhook']
        },
        bodyParsers: false
      }
    });
    app = await getTestApp(appServer);

    alice = await createTestActor(podProvider, 'alice');

    await installApp(alice, app.id);
  }, 110_000);

  afterAll(async () => {
    podProvider.stop();
    appServer.stop();
  });

  test('Webhook channel is available', async () => {
    const { json: storage } = await fetchServer(urlJoin(POD_SERVER_BASE_URL, '.well-known/solid'));

    expect(storage.type).toBe('pim:Storage');
    expect(storage['notify:subscription']).toHaveLength(2);

    webhookChannelSubscriptionUrl = storage['notify:subscription'].find((uri: any) =>
      uri.includes('/WebhookChannel2023')
    );

    const { json: webhookChannelSubscription } = await fetchServer(webhookChannelSubscriptionUrl);

    expect(webhookChannelSubscription).toMatchObject({
      'notify:channelType': 'notify:WebhookChannel2023',
      'notify:feature': ['notify:endAt', 'notify:rate', 'notify:startAt', 'notify:state']
    });
  });

  test('Cannot create webhook channel without read rights', async () => {
    // Alice profile is not public
    const { status } = await fetchServer(webhookChannelSubscriptionUrl, {
      method: 'POST',
      headers: new fetch.Headers({ 'Content-Type': 'application/ld+json' }),
      body: {
        '@context': {
          notify: 'http://www.w3.org/ns/solid/notifications#'
        },
        '@type': 'notify:WebhookChannel2023',
        'notify:topic': alice.url,
        'notify:sendTo': urlJoin(APP_SERVER_BASE_URL, 'fake-webhook')
      }
    });

    expect(status).toBe(403);
  });

  test('Cannot create webhook channel for unexisting resources', async () => {
    const { status } = await fetchServer(webhookChannelSubscriptionUrl, {
      method: 'POST',
      headers: new fetch.Headers({ 'Content-Type': 'application/ld+json' }),
      body: {
        '@context': {
          notify: 'http://www.w3.org/ns/solid/notifications#'
        },
        '@type': 'notify:WebhookChannel2023',
        'notify:topic': `${alice.url}-unexisting`,
        'notify:sendTo': urlJoin(APP_SERVER_BASE_URL, 'fake-webhook')
      }
    });

    expect(status).toBe(400);
  });

  test('Create webhook channel as registered app', async () => {
    const { body } = await app.call('signature.proxy.query', {
      url: webhookChannelSubscriptionUrl,
      method: 'POST',
      headers: new fetch.Headers({ 'Content-Type': 'application/ld+json' }),
      body: JSON.stringify({
        '@context': {
          notify: 'http://www.w3.org/ns/solid/notifications#'
        },
        '@type': 'notify:WebhookChannel2023',
        'notify:topic': alice.outbox,
        'notify:sendTo': urlJoin(APP_SERVER_BASE_URL, 'fake-webhook')
      }),
      actorUri: app.id
    });

    webhookChannelUri = body.id;

    const webhookChannelContainer = await alice.call('solid-notifications.provider.webhook.getContainerUri', {
      webId: alice.id
    });
    await expect(
      alice.call('ldp.container.includes', {
        containerUri: webhookChannelContainer,
        resourceUri: webhookChannelUri
      })
    ).resolves.toBeTruthy();

    expect(body).toMatchObject({
      type: 'notify:WebhookChannel2023',
      'notify:topic': alice.outbox,
      'notify:sendTo': urlJoin(APP_SERVER_BASE_URL, 'fake-webhook')
    });
  });

  test('Listen to Alice outbox', async () => {
    const activity = await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: 'Event',
      content: 'Birthday party !'
    });

    await tryUntilTimeout(async () => {
      expect(mockWebhookAction).toHaveBeenCalledTimes(1);
    }, 10000);

    expect(mockWebhookAction.mock.calls[0][0].params).toMatchObject({
      '@context': ['https://www.w3.org/ns/activitystreams', 'https://www.w3.org/ns/solid/notifications-context/v1'],
      type: 'Add',
      object: activity.id || activity['@id'],
      target: alice.outbox
    });
  });

  test('Delete webhook channel', async () => {
    const response = await app.call('signature.proxy.query', {
      url: webhookChannelUri,
      method: 'DELETE',
      actorUri: app.id
    });

    expect(response.status).toBe(204);

    await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: 'Event',
      content: 'Birthday party 2 !'
    });

    await delay(5000);

    expect(mockWebhookAction).not.toHaveBeenCalledTimes(2);
  });

  test('Listen to Alice outbox through listener', async () => {
    await app.call('solid-notifications.listener.register', {
      resourceUri: alice.outbox,
      actionName: 'fake-service.webhook2'
    });

    const activity = await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: 'Event',
      content: 'Birthday party 3 !'
    });

    await tryUntilTimeout(async () => {
      expect(mockWebhookAction2).toHaveBeenCalledTimes(1);
    }, 10_000);

    expect(mockWebhookAction2.mock.calls[0][0].params).toMatchObject({
      '@context': ['https://www.w3.org/ns/activitystreams', 'https://www.w3.org/ns/solid/notifications-context/v1'],
      type: 'Add',
      object: activity.id || activity['@id'],
      target: alice.outbox
    });
  });
});
