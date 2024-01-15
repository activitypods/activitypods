const path = require('path');
const urlJoin = require('url-join');
const fetch = require('node-fetch');
const waitForExpect = require('wait-for-expect');
const { MIME_TYPES } = require('@semapps/mime-types');
const { initialize, initializeAppServer, clearDataset, listDatasets, installApp } = require('./initialize');
const { interopContext } = require('@activitypods/core');
const ExampleAppService = require('./apps/example.app');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');
const { fetchServer } = require('./utils');

jest.setTimeout(80000);

const POD_SERVER_BASE_URL = 'http://localhost:3000';
const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');

const mockWebhookAction = jest.fn(() => Promise.resolve());

describe('Test app installation', () => {
  let podServer, alice, appServer, webhookChannelSubscriptionUrl, webhookChannelUri;

  beforeAll(async () => {
    const datasets = await listDatasets();
    for (let dataset of datasets) {
      await clearDataset(dataset);
    }

    podServer = await initialize(3000, 'settings');
    await podServer.loadService(path.resolve(__dirname, './services/profiles.app.js'));
    await podServer.start();

    appServer = await initializeAppServer(3001, 'app_settings');
    await appServer.createService(ExampleAppService);
    await appServer.createService({
      name: 'fake-service',
      actions: { webhook: mockWebhookAction }
    });
    await appServer.start();
    await appServer.call('api.addRoute', {
      route: {
        path: '/fake-webhook',
        authorization: false,
        authentication: false,
        aliases: {
          'POST /': 'fake-service.webhook'
        },
        bodyParsers: { json: true }
      }
    });

    const actorData = require(`./data/actor1.json`);
    const { webId } = await podServer.call('auth.signup', actorData);
    alice = await podServer.call(
      'activitypub.actor.awaitCreateComplete',
      {
        actorUri: webId,
        additionalKeys: ['url']
      },
      { meta: { dataset: actorData.username } }
    );
    alice.call = (actionName, params, options = {}) =>
      podServer.call(actionName, params, {
        ...options,
        meta: { ...options.meta, webId, dataset: alice.preferredUsername }
      });

    await installApp(alice, APP_URI);
  }, 80000);

  afterAll(async () => {
    await podServer.stop();
    await appServer.stop();
  });

  test('User installs app and grants all access needs', async () => {
    const { json: storage } = await fetchServer(urlJoin(POD_SERVER_BASE_URL, '.well-known/solid'));

    expect(storage['@type']).toBe('http://www.w3.org/ns/pim/space#Storage');
    expect(storage['notify:subscription']).toHaveLength(2);

    webhookChannelSubscriptionUrl = storage['notify:subscription'][1];

    const { json: webhookChannelSubscription } = await fetchServer(webhookChannelSubscriptionUrl);

    expect(webhookChannelSubscription).toMatchObject({
      'notify:channelType': 'notify:WebhookChannel2023',
      'notify:features': ['notify:accept', 'notify:endAt', 'notify:rate', 'notify:startAt', 'notify:state']
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
    // Alice profile is not public
    const { status } = await fetchServer(webhookChannelSubscriptionUrl, {
      method: 'POST',
      headers: new fetch.Headers({ 'Content-Type': 'application/ld+json' }),
      body: {
        '@context': {
          notify: 'http://www.w3.org/ns/solid/notifications#'
        },
        '@type': 'notify:WebhookChannel2023',
        'notify:topic': alice.url + '-unexisting',
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
        'notify:topic': alice.inbox,
        'notify:sendTo': urlJoin(APP_SERVER_BASE_URL, 'fake-webhook')
      }),
      actorUri: APP_URI
    });

    webhookChannelUri = body.id;

    await expect(
      alice.call('ldp.container.includes', {
        containerUri: urlJoin(alice.id, 'data', 'notify', 'webhook-channel2023'),
        resourceUri: webhookChannelUri
      })
    ).resolves.toBeTruthy();

    expect(body).toMatchObject({
      type: 'notify:WebhookChannel2023',
      'notify:topic': alice.inbox,
      'notify:sendTo': urlJoin(APP_SERVER_BASE_URL, 'fake-webhook')
    });
  });
});
