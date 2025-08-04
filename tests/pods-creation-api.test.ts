import waitForExpect from 'wait-for-expect';
import urlJoin from 'url-join';
import fetch from 'node-fetch';
import { connectPodProvider, clearAllData } from './initialize.ts';
jest.setTimeout(50000);
const BASE_URL = 'http://localhost:3000';

describe('Test pods creation via API', () => {
  let podProvider, token, alice, projectUri;

  const fetchServer = (path, options = {}) => {
    if (!path) throw new Error('No path provided to fetchServer');
    if (!options.headers) options.headers = new fetch.Headers();

    switch (options.method) {
      case 'POST':
      case 'PATCH':
      case 'PUT':
        if (!options.headers.has('Accept')) options.headers.set('Accept', 'application/ld+json');
        if (!options.headers.has('Content-Type')) options.headers.set('Content-Type', 'application/ld+json');
        break;
      case 'DELETE':
        break;
      case 'GET':
      default:
        if (!options.headers.has('Accept')) options.headers.set('Accept', 'application/ld+json');
        break;
    }

    if (token) options.headers.set('Authorization', `Bearer ${token}`);

    if (options.body && options.headers.get('Content-Type').includes('json')) {
      options.body = JSON.stringify(options.body);
    }

    return fetch(path.startsWith('http') ? path : urlJoin(BASE_URL, path), {
      method: options.method || 'GET',
      body: options.body,
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

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();
  });

  afterAll(async () => {
    await podProvider.stop();
  });

  test('Alice signup for a pod', async () => {
    const aliceData = require(`./data/actor1.json`);

    const { json } = await fetchServer('/auth/signup', {
      method: 'POST',
      body: aliceData,
      headers: new fetch.Headers({
        'Content-Type': 'application/json' // We must not use JSON-LD here
      })
    });

    expect(json.webId).toBe(BASE_URL + '/alice');
    expect(json.newUser).toBe(true);

    // Keep in memory token so that future fetch are authentified
    token = json.token;
  });

  test('Alice actor can be fetched', async () => {
    await waitForExpect(async () => {
      ({ json: alice } = await fetchServer(BASE_URL + '/alice', { method: 'GET' }));

      expect(alice).toMatchObject({
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
          publicKeyPem: expect.stringContaining('-----BEGIN PUBLIC KEY-----')
        },
        endpoints: {
          proxyUrl: BASE_URL + '/alice/proxy',
          'void:sparqlEndpoint': BASE_URL + '/alice/sparql'
        },
        'pim:storage': BASE_URL + '/alice/data',
        'solid:oidcIssuer': BASE_URL,
        'interop:hasAuthorizationAgent': expect.anything(),
        'interop:hasRegistrySet': expect.anything(),
        url: expect.anything()
      });
    });
  });

  test('Alice collections can be fetched', async () => {
    await expect(fetchServer(alice.outbox)).resolves.toMatchObject({
      json: {
        type: 'OrderedCollection',
        id: alice.outbox
      }
    });
    await expect(fetchServer(alice.inbox)).resolves.toMatchObject({
      json: {
        type: 'OrderedCollection',
        id: alice.inbox
      }
    });
    await expect(fetchServer(alice.followers)).resolves.toMatchObject({
      json: {
        type: 'Collection',
        id: alice.followers
      }
    });
    await expect(fetchServer(alice.following)).resolves.toMatchObject({
      json: {
        type: 'Collection',
        id: alice.following
      }
    });
  });

  test('Alice profile can be fetched', async () => {
    await expect(fetchServer(alice.url)).resolves.toMatchObject({
      json: { describes: alice.id }
    });
  });

  test('Alice can post on her Pod', async () => {
    const { status, headers } = await fetchServer(alice['pim:storage'], {
      method: 'POST',
      body: {
        '@context': 'https://activitypods.org/context.json',
        type: 'pair:Project',
        'pair:label': 'ActivityPods'
      }
    });

    expect(status).toBe(201);

    projectUri = headers.get('Location');
    expect(projectUri).not.toBeUndefined();

    await expect(fetchServer(alice['pim:storage'])).resolves.toMatchObject({
      json: {
        type: ['ldp:Container', 'ldp:BasicContainer'],
        'ldp:contains': expect.arrayContaining([
          expect.objectContaining({
            id: projectUri,
            type: 'pair:Project'
          })
        ])
      }
    });
  });

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

    expect(json).toMatchObject([
      {
        type: {
          termType: 'NamedNode',
          value: 'http://virtual-assembly.org/ontologies/pair#Project'
        }
      }
    ]);
  });

  test('Alice can post to her own outbox', async () => {
    const { status } = await fetchServer(alice.outbox, {
      method: 'POST',
      body: {
        '@context': 'https://activitypods.org/context.json',
        type: 'Like',
        object: projectUri
      }
    });

    expect(status).toBe(201);
  });
});
