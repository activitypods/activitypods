import waitForExpect from 'wait-for-expect';
import { ServiceBroker } from 'moleculer';
import urlJoin from 'url-join';
import fetch from 'node-fetch';
import { connectPodProvider, clearAllData } from './initialize.ts';
import { FetchOptions } from './utilTypes.js';
jest.setTimeout(50000);

const BASE_URL = 'http://localhost:3000';
const ALICE_BASE_URL = BASE_URL + '/alice';

describe('Test pods creation via API', () => {
  let podProvider: ServiceBroker, token: string, alice: any, webId: string, projectUri: string;

  const fetchServer = async (path: any, options: FetchOptions = {}) => {
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
      body: options.body as fetch.BodyInit,
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
    const { json } = await fetchServer('/auth/signup', {
      method: 'POST',
      body: {
        username: 'alice',
        email: 'alice@test.com',
        password: 'Test1test',
        name: 'Alice',
        'schema:knowsLanguage': 'en'
      },
      headers: new fetch.Headers({
        'Content-Type': 'application/json' // We must not use JSON-LD here
      })
    });

    expect(json.webId).toBeDefined();
    expect(json.newUser).toBe(true);

    // Keep in memory token so that future fetch are authenticated
    token = json.token;
    webId = json.webId;
  });

  test('Alice actor can be fetched', async () => {
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      ({ json: alice } = await fetchServer(webId));

      expect(alice).toMatchObject({
        type: expect.arrayContaining(['foaf:Person', 'Person']),
        'foaf:nick': 'alice',
        preferredUsername: 'alice',
        inbox: expect.anything(),
        outbox: expect.anything(),
        following: expect.anything(),
        followers: expect.anything(),
        liked: expect.anything(),
        publicKey: {
          owner: alice.id,
          publicKeyPem: expect.stringContaining('-----BEGIN PUBLIC KEY-----')
        },
        endpoints: {
          proxyUrl: ALICE_BASE_URL + '/proxy',
          'void:sparqlEndpoint': ALICE_BASE_URL + '/sparql'
        },
        'pim:storage': expect.anything(),
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

    projectUri = headers.get('Location')!;
    expect(projectUri).not.toBeUndefined();

    await expect(fetchServer(alice['pim:storage'])).resolves.toMatchObject({
      json: {
        type: expect.arrayContaining(['ldp:Container', 'ldp:BasicContainer']),
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
    const { json } = await fetchServer('/alice/sparql', {
      method: 'POST',
      body: `
        SELECT ?type
        WHERE {
          GRAPH <${projectUri}> {
            <${projectUri}> a ?type
          }
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
