// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import fetch from 'node-fetch';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import { connectPodProvider, clearAllData, initializeAppServer, installApp } from './initialize.ts';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import ExampleAppService from './apps/example.app.ts';
// @ts-expect-error TS(6059): File '/home/laurin/projects/virtual-assembly/semap... Remove this comment to see the full error message
import { parseHeader, negotiateContentType, parseJson } from '@semapps/middlewares';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import { fetchServer, tryUntilTimeout } from './utils.ts';
// @ts-expect-error TS(2305): Module '"@semapps/ldp"' has no exported member 'de... Remove this comment to see the full error message
import { delay } from '@semapps/ldp';
// @ts-expect-error TS(2304): Cannot find name 'jest'.
jest.setTimeout(110_000);
const POD_SERVER_BASE_URL = 'http://localhost:3000';
const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');
// @ts-expect-error TS(2304): Cannot find name 'jest'.
const mockWebhookAction = jest.fn(() => Promise.resolve());
// @ts-expect-error TS(2304): Cannot find name 'jest'.
const mockWebhookAction2 = jest.fn(() => Promise.resolve());

// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('Test app installation', () => {
  let podProvider: any, alice: any, appServer: any, webhookChannelSubscriptionUrl: any, webhookChannelUri: any;

  // @ts-expect-error TS(2304): Cannot find name 'beforeAll'.
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
    alice.call = (actionName: any, params: any, options = {}) =>
      podProvider.call(actionName, params, {
        ...options,
        // @ts-expect-error TS(2339): Property 'meta' does not exist on type '{}'.
        meta: { ...options.meta, webId, dataset: alice.preferredUsername }
      });

    await installApp(alice, APP_URI);
  }, 110_000);

  // @ts-expect-error TS(2304): Cannot find name 'afterAll'.
  afterAll(async () => {
    podProvider.stop();
    appServer.stop();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Webhook channel is available', async () => {
    const { json: storage } = await fetchServer(urlJoin(POD_SERVER_BASE_URL, '.well-known/solid'));

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(storage.type).toBe('pim:Storage');
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(storage['notify:subscription']).toHaveLength(2);

    webhookChannelSubscriptionUrl = storage['notify:subscription'].find((uri: any) =>
      uri.includes('/WebhookChannel2023')
    );

    const { json: webhookChannelSubscription } = await fetchServer(webhookChannelSubscriptionUrl);

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(webhookChannelSubscription).toMatchObject({
      'notify:channelType': 'notify:WebhookChannel2023',
      'notify:feature': ['notify:endAt', 'notify:rate', 'notify:startAt', 'notify:state']
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(status).toBe(403);
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(status).toBe(400);
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      alice.call('ldp.container.includes', {
        containerUri: webhookChannelContainer,
        resourceUri: webhookChannelUri
      })
    ).resolves.toBeTruthy();

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(body).toMatchObject({
      type: 'notify:WebhookChannel2023',
      'notify:topic': alice.outbox,
      'notify:sendTo': urlJoin(APP_SERVER_BASE_URL, 'fake-webhook')
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Listen to Alice outbox', async () => {
    const activity = await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: 'Event',
      content: 'Birthday party !'
    });

    await tryUntilTimeout(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(mockWebhookAction).toHaveBeenCalledTimes(1);
    }, 10000);

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(mockWebhookAction.mock.calls[0][0].params).toMatchObject({
      '@context': ['https://www.w3.org/ns/activitystreams', 'https://www.w3.org/ns/solid/notifications-context/v1'],
      type: 'Add',
      object: activity.id || activity['@id'],
      target: alice.outbox
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Delete webhook channel', async () => {
    const response = await appServer.call('signature.proxy.query', {
      url: webhookChannelUri,
      method: 'DELETE',
      actorUri: APP_URI
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(response.status).toBe(204);

    await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: 'Event',
      content: 'Birthday party 2 !'
    });

    await delay(5000);

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(mockWebhookAction).not.toHaveBeenCalledTimes(2);
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(mockWebhookAction2).toHaveBeenCalledTimes(1);
    }, 10_000);

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(mockWebhookAction2.mock.calls[0][0].params).toMatchObject({
      '@context': ['https://www.w3.org/ns/activitystreams', 'https://www.w3.org/ns/solid/notifications-context/v1'],
      type: 'Add',
      object: activity.id || activity['@id'],
      target: alice.outbox
    });
  });
});
