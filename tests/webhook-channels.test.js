const urlJoin = require('url-join');
const fetch = require('node-fetch');
const { connectPodProvider, clearAllData, initializeAppServer, installApp } = require('./initialize');
const ExampleAppService = require('./apps/example.app');
const { parseHeader, negotiateContentType, parseJson } = require('@semapps/middlewares');
const { fetchServer, tryUntilTimeout } = require('./utils');
const { delay } = require('@semapps/ldp');

jest.setTimeout(110_000);

const POD_SERVER_BASE_URL = 'http://localhost:3000';
const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');

const mockWebhookAction = jest.fn(() => Promise.resolve());
const mockWebhookAction2 = jest.fn(() => Promise.resolve());

describe('Test app installation', () => {
  let podProvider, alice, appServer, webhookChannelSubscriptionUrl, webhookChannelUri;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
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
          'POST /': [parseHeader, negotiateContentType, parseJson, 'fake-service.webhook']
        },
        bodyParsers: false
      }
    });

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
    alice.call = (actionName, params, options = {}) =>
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

  test('Webhook channel is available', async () => {
    const { json: storage } = await fetchServer(urlJoin(POD_SERVER_BASE_URL, '.well-known/solid'));

    expect(storage['@type']).toBe('http://www.w3.org/ns/pim/space#Storage');
    expect(storage['notify:subscription']).toHaveLength(2);

    [_, webhookChannelSubscriptionUrl] = storage['notify:subscription'];

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
    const { body } = await appServer.call('signature.proxy.query', {
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
      actorUri: APP_URI
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
    const response = await appServer.call('signature.proxy.query', {
      url: webhookChannelUri,
      method: 'DELETE',
      actorUri: APP_URI
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
    await appServer.call('solid-notifications.listener.register', {
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
