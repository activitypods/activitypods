import waitForExpect from 'wait-for-expect';
// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import fetch from 'node-fetch';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import { connectPodProvider, clearAllData } from './initialize.ts';
// @ts-expect-error TS(2304): Cannot find name 'jest'.
jest.setTimeout(50000);
const BASE_URL = 'http://localhost:3000';

// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('Test pods creation via API', () => {
  let podProvider: any, token: any, alice: any, projectUri: any;

  const fetchServer = (path: any, options = {}) => {
    if (!path) throw new Error('No path provided to fetchServer');
    // @ts-expect-error TS(2339): Property 'headers' does not exist on type '{}'.
    if (!options.headers) options.headers = new fetch.Headers();

    // @ts-expect-error TS(2339): Property 'method' does not exist on type '{}'.
    switch (options.method) {
      case 'POST':
      case 'PATCH':
      case 'PUT':
        // @ts-expect-error TS(2339): Property 'headers' does not exist on type '{}'.
        if (!options.headers.has('Accept')) options.headers.set('Accept', 'application/ld+json');
        // @ts-expect-error TS(2339): Property 'headers' does not exist on type '{}'.
        if (!options.headers.has('Content-Type')) options.headers.set('Content-Type', 'application/ld+json');
        break;
      case 'DELETE':
        break;
      case 'GET':
      default:
        // @ts-expect-error TS(2339): Property 'headers' does not exist on type '{}'.
        if (!options.headers.has('Accept')) options.headers.set('Accept', 'application/ld+json');
        break;
    }

    // @ts-expect-error TS(2339): Property 'headers' does not exist on type '{}'.
    if (token) options.headers.set('Authorization', `Bearer ${token}`);

    // @ts-expect-error TS(2339): Property 'body' does not exist on type '{}'.
    if (options.body && options.headers.get('Content-Type').includes('json')) {
      // @ts-expect-error TS(2339): Property 'body' does not exist on type '{}'.
      options.body = JSON.stringify(options.body);
    }

    return fetch(path.startsWith('http') ? path : urlJoin(BASE_URL, path), {
      // @ts-expect-error TS(2339): Property 'method' does not exist on type '{}'.
      method: options.method || 'GET',
      // @ts-expect-error TS(2339): Property 'body' does not exist on type '{}'.
      body: options.body,
      // @ts-expect-error TS(2339): Property 'headers' does not exist on type '{}'.
      headers: options.headers
    })
      .then(response =>
        response.text().then(text => ({
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          body: text
        }))
      )
      .then(({ status, statusText, headers, body }) => {
        let json;
        try {
          json = JSON.parse(body);
        } catch (e) {
          // not json, no big deal
        }
        return Promise.resolve({ status, statusText, headers, body, json });
      });
  };

  // @ts-expect-error TS(2304): Cannot find name 'beforeAll'.
  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();
  });

  // @ts-expect-error TS(2304): Cannot find name 'afterAll'.
  afterAll(async () => {
    await podProvider.stop();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Alice signup for a pod', async () => {
    const aliceData = require(`./data/actor1.json`);

    const { json } = await fetchServer('/auth/signup', {
      method: 'POST',
      body: aliceData,
      headers: new fetch.Headers({
        'Content-Type': 'application/json' // We must not use JSON-LD here
      })
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(json.webId).toBe(BASE_URL + '/alice');
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(json.newUser).toBe(true);

    // Keep in memory token so that future fetch are authentified
    token = json.token;
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Alice actor can be fetched', async () => {
    await waitForExpect(async () => {
      ({ json: alice } = await fetchServer(BASE_URL + '/alice', { method: 'GET' }));

      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(alice).toMatchObject({
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        type: expect.arrayContaining(['foaf:Person', 'Person']),
        'foaf:nick': 'alice',
        preferredUsername: 'alice',
        inbox: BASE_URL + '/alice/inbox',
        outbox: BASE_URL + '/alice/outbox',
        following: BASE_URL + '/alice/following',
        followers: BASE_URL + '/alice/followers',
        liked: BASE_URL + '/alice/liked',
        publicKey: {
          owner: BASE_URL + '/alice',
          // @ts-expect-error TS(2304): Cannot find name 'expect'.
          publicKeyPem: expect.stringContaining('-----BEGIN PUBLIC KEY-----')
        },
        endpoints: {
          proxyUrl: BASE_URL + '/alice/proxy',
          'void:sparqlEndpoint': BASE_URL + '/alice/sparql'
        },
        'pim:storage': BASE_URL + '/alice/data',
        'solid:oidcIssuer': BASE_URL,
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        'interop:hasAuthorizationAgent': expect.anything(),
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        'interop:hasRegistrySet': expect.anything(),
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        url: expect.anything()
      });
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Alice collections can be fetched', async () => {
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(fetchServer(alice.outbox)).resolves.toMatchObject({
      json: {
        type: 'OrderedCollection',
        id: alice.outbox
      }
    });
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(fetchServer(alice.inbox)).resolves.toMatchObject({
      json: {
        type: 'OrderedCollection',
        id: alice.inbox
      }
    });
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(fetchServer(alice.followers)).resolves.toMatchObject({
      json: {
        type: 'Collection',
        id: alice.followers
      }
    });
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(fetchServer(alice.following)).resolves.toMatchObject({
      json: {
        type: 'Collection',
        id: alice.following
      }
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Alice profile can be fetched', async () => {
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(fetchServer(alice.url)).resolves.toMatchObject({
      json: { describes: alice.id }
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Alice can post on her Pod', async () => {
    const { status, headers } = await fetchServer(alice['pim:storage'], {
      method: 'POST',
      body: {
        '@context': 'https://activitypods.org/context.json',
        type: 'pair:Project',
        'pair:label': 'ActivityPods'
      }
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(status).toBe(201);

    projectUri = headers.get('Location');
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(projectUri).not.toBeUndefined();

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(fetchServer(alice['pim:storage'])).resolves.toMatchObject({
      json: {
        type: ['ldp:Container', 'ldp:BasicContainer'],
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        'ldp:contains': expect.arrayContaining([
          // @ts-expect-error TS(2304): Cannot find name 'expect'.
          expect.objectContaining({
            id: projectUri,
            type: 'pair:Project'
          })
        ])
      }
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Alice can query through the SPARQL endpoint of her pod', async () => {
    const { json } = await fetchServer(urlJoin(alice.id, 'sparql'), {
      method: 'POST',
      body: `
        SELECT ?type
        WHERE {
          <${projectUri}> a ?type
        }
      `,
      headers: new fetch.Headers({
        'Content-Type': 'application/sparql-query',
        Accept: 'application/sparql-results+json'
      })
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(json).toMatchObject([
      {
        type: {
          termType: 'NamedNode',
          value: 'http://virtual-assembly.org/ontologies/pair#Project'
        }
      }
    ]);
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Alice can post to her own outbox', async () => {
    const { status } = await fetchServer(alice.outbox, {
      method: 'POST',
      body: {
        '@context': 'https://activitypods.org/context.json',
        type: 'Like',
        object: projectUri
      }
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(status).toBe(201);
  });
});
