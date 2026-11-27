import urlJoin from 'url-join';
import fetch from 'node-fetch';
import { SignJWT, importJWK } from 'jose';
import { MIME_TYPES } from '@semapps/mime-types';
import { OBJECT_TYPES, ACTIVITY_TYPES, PUBLIC_URI } from '@semapps/activitypub';
import { connectPodProvider, clearAllData, installApp, initializeAppServer } from './initialize.ts';
import ExampleAppService from './apps/example.app.ts';
jest.setTimeout(120000);

const APP_URI = urlJoin('http://localhost:3001', 'app');

describe('Requests made by an app with an OIDC token', () => {
  let podProvider: any, appServer: any, alice: any, bob: any, craig: any, eventUri: string, noteUri: string;
  const tokens: Record<string, string> = {};

  const getToken = async (webId: string, clientId: string) => {
    const { privateJwk } = await podProvider.call('jwk.get');
    return new SignJWT({ webid: webId, azp: clientId })
      .setProtectedHeader({ alg: 'ES256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(await importJWK(privateJwk, 'ES256'));
  };

  const fetchAs = (actor: any, url: string, method = 'GET', body?: any) =>
    fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${tokens[actor.id]}`,
        Accept: MIME_TYPES.JSON,
        ...(body ? { 'Content-Type': MIME_TYPES.JSON } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

  const getObjectUri = (activity: any) =>
    typeof activity.object === 'string' ? activity.object : activity.object.id || activity.object['@id'];

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
    await appServer.start();

    const actors = [];
    for (let i = 1; i <= 3; i++) {
      const actorData = require(`./data/actor${i}.json`);
      const { webId } = await podProvider.call('auth.signup', actorData);
      const actor = await podProvider.call(
        'activitypub.actor.awaitCreateComplete',
        { actorUri: webId },
        { meta: { dataset: actorData.username } }
      );
      actor.call = (actionName: any, params: any, options: any = {}) =>
        podProvider.call(actionName, params, {
          ...options,
          meta: { ...options.meta, webId, dataset: actorData.username }
        });
      actors.push(actor);
    }
    [alice, bob, craig] = actors;

    // Craig does not register the app
    await installApp(alice, APP_URI);
    await installApp(bob, APP_URI);

    for (const actor of actors) {
      tokens[actor.id] = await getToken(actor.id, APP_URI);
    }

    const noteActivity = await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: ACTIVITY_TYPES.CREATE,
      object: { type: OBJECT_TYPES.NOTE, content: 'Not for the app' }
    });
    noteUri = getObjectUri(noteActivity);
  }, 120000);

  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
  });

  test('The app posts to the outbox of the user', async () => {
    const res = await fetchAs(alice, alice.outbox, 'POST', {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: ACTIVITY_TYPES.CREATE,
      object: { type: OBJECT_TYPES.EVENT, name: 'Birthday party' }
    });
    expect(res.status).toBe(201);

    const activity: any = await (await fetchAs(alice, res.headers.get('location')!)).json();
    expect(activity).toMatchObject({ actor: alice.id, generator: APP_URI });
    eventUri = getObjectUri(activity);
  });

  test('The app cannot post a type it was not granted', async () => {
    const res = await fetchAs(alice, alice.outbox, 'POST', {
      '@context': 'https://www.w3.org/ns/activitystreams',
      type: ACTIVITY_TYPES.CREATE,
      object: { type: OBJECT_TYPES.NOTE, content: 'Hello' }
    });
    expect(res.status).toBe(403);
  });

  test('The app reads the data it was granted, and only this data', async () => {
    let res = await fetchAs(alice, eventUri);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: 'Birthday party', 'dc:creator': alice.id });

    // Alice can read the note, but the app cannot
    res = await fetchAs(alice, noteUri);
    expect(res.status).toBe(403);
  });

  test('The rights of the app are limited to those of the user', async () => {
    // The app has access to the event, but not Bob
    let res = await fetchAs(bob, eventUri);
    expect(res.status).toBe(403);

    await podProvider.call('webacl.resource.addRights', {
      resourceUri: eventUri,
      additionalRights: { user: { uri: bob.id, read: true } },
      webId: 'system'
    });

    res = await fetchAs(bob, eventUri);
    expect(res.status).toBe(200);
  });

  test('The app must be registered by the user', async () => {
    await podProvider.call('webacl.resource.addRights', {
      resourceUri: eventUri,
      additionalRights: { user: { uri: craig.id, read: true } },
      webId: 'system'
    });

    // Craig can read the event, and the app too, but Craig did not register the app
    const res = await fetchAs(craig, eventUri);
    expect(res.status).toBe(403);
  });

  test('Any app reads the public data', async () => {
    const activity = await bob.call('activitypub.outbox.post', {
      collectionUri: bob.outbox,
      type: ACTIVITY_TYPES.CREATE,
      object: { type: OBJECT_TYPES.NOTE, content: 'Public note' },
      to: PUBLIC_URI
    });
    const publicNoteUri = getObjectUri(activity);

    // Craig did not register the app
    let res = await fetchAs(craig, craig.id);
    expect(res.status).toBe(200);

    res = await fetchAs(craig, craig['interop:hasAuthorizationAgent']);
    expect(res.status).toBe(200);
    expect(res.headers.get('link') || '').not.toContain('registeredAgent');

    res = await fetchAs(craig, publicNoteUri);
    expect(res.status).toBe(200);

    res = await fetchAs(craig, bob.outbox);
    expect(res.status).toBe(200);

    // Alice did not grant the app access to notes
    res = await fetchAs(alice, publicNoteUri);
    expect(res.status).toBe(200);
  });

  test('The app reads the inbox of the user', async () => {
    const res = await fetchAs(alice, alice.inbox);
    expect(res.status).toBe(200);
  });

  test('The authorization agent links to the app registration', async () => {
    const res = await fetchAs(alice, alice['interop:hasAuthorizationAgent']);
    expect(res.status).toBe(200);
    expect(res.headers.get('link')).toContain(`<${APP_URI}>`);
    expect(res.headers.get('link')).toContain('rel="http://www.w3.org/ns/solid/interop#registeredAgent"');
  });

  test('The app status is returned for the user', async () => {
    const res = await fetchAs(alice, 'http://localhost:3000/.well-known/app-status');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ installed: true });
  });

  test('The app cannot call the API actions which are not open to applications', async () => {
    let res = await fetchAs(alice, 'http://localhost:3000/auth/account');
    expect(res.status).toBe(403);

    res = await fetchAs(alice, 'http://localhost:3000/.account/groups');
    expect(res.status).toBe(403);
  });

  const fetchOnBehalfOf = (actor: any, url: string, headers = {}) =>
    appServer.call('signature.proxy.query', {
      url,
      method: 'GET',
      headers: { Accept: MIME_TYPES.JSON, ...headers },
      actorUri: APP_URI,
      onBehalfOf: actor?.id
    });

  test('The app backend acts on behalf of the user', async () => {
    let res = await fetchOnBehalfOf(alice, eventUri);
    expect(res.status).toBe(200);

    res = await fetchOnBehalfOf(alice, noteUri);
    expect(res.status).toBe(403);

    // Bob and Craig were given the right to read the event in the tests above
    res = await fetchOnBehalfOf(bob, eventUri);
    expect(res.status).toBe(200);
  });

  test('The app backend cannot act on behalf of a user who did not register it', async () => {
    const res = await fetchOnBehalfOf(craig, eventUri);
    expect(res.status).toBe(403);
  });

  test('The app backend cannot act on behalf of an unknown user', async () => {
    const res = await fetchOnBehalfOf({ id: 'http://localhost:3000/nobody' }, eventUri);
    expect(res.status).toBe(403);
  });

  test('The On-Behalf-Of header must be signed', async () => {
    const res = await fetchOnBehalfOf(undefined, eventUri, { 'On-Behalf-Of': alice.id });
    expect(res.status).toBe(401);
  });
});
