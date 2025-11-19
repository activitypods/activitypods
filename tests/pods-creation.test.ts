import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { ServiceBroker } from 'moleculer';
import { MIME_TYPES } from '@semapps/mime-types';
import { connectPodProvider, clearAllData } from './initialize.ts';
import { createAccount } from './utils.ts';

jest.setTimeout(50000);

describe('Test pods creation', () => {
  let podProvider: ServiceBroker;
  let alice: any;
  let projectUri: string;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    alice = await createAccount(podProvider, 'alice');
  }, 80000);

  afterAll(async () => {
    await podProvider.stop();
  });

  test('Alice WebID has the required information', async () => {
    expect(alice['pim:storage']).toBeDefined();
    expect(alice['solid:oidcIssuer']).toBe(new URL(alice.id).origin);
    expect(alice['solid:publicTypeIndex']).toBeDefined();
    expect(alice['interop:hasAuthorizationAgent']).toBeDefined();
    expect(alice['interop:hasRegistrySet']).toBeDefined();
  });

  test('Alice collections can be fetched', async () => {
    await expect(
      alice.call('activitypub.collection.get', {
        resourceUri: alice.outbox
      })
    ).resolves.toMatchObject({
      type: 'OrderedCollection',
      id: alice.outbox
    });

    await expect(
      alice.call('activitypub.collection.get', {
        resourceUri: alice.inbox
      })
    ).resolves.toMatchObject({
      type: 'OrderedCollection',
      id: alice.inbox
    });

    await expect(
      alice.call('activitypub.collection.get', {
        resourceUri: alice.followers
      })
    ).resolves.toMatchObject({
      type: 'Collection',
      id: alice.followers
    });

    await expect(
      alice.call('activitypub.collection.get', {
        resourceUri: alice.following
      })
    ).resolves.toMatchObject({
      type: 'Collection',
      id: alice.following
    });
  }, 80000);

  test('Alice profile can be fetched', async () => {
    await expect(alice.call('ldp.resource.get', { resourceUri: alice.url })).resolves.toMatchObject({
      describes: alice.id
    });
  }, 80000);

  test('Alice TypeIndex has been created', async () => {
    // TypeRegistrations take time to be populated
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      const publicTypeIndex = await alice.call('public-type-index.get');

      expect(publicTypeIndex['@graph']).toContainEqual(
        expect.objectContaining({
          'solid:forClass': expect.arrayContaining(['vcard:Individual', 'as:Profile']),
          'solid:instanceContainer': urlJoin(alice.baseUrl, '/vcard/individual')
        })
      );
    });
  }, 80000);

  test('Alice can post on her Pod', async () => {
    projectUri = await alice.call('ldp.container.post', {
      containerUri: alice['pim:storage'],
      resource: {
        '@context': 'https://activitypods.org/context.json',
        type: 'pair:Project',
        'pair:label': 'ActivityPods'
      },
      contentType: MIME_TYPES.JSON
    });

    await expect(alice.call('ldp.resource.get', { resourceUri: projectUri })).resolves.toMatchObject({
      type: 'pair:Project',
      'pair:label': 'ActivityPods'
    });
  }, 80000);

  test('Alice can query through the SPARQL endpoint of her pod', async () => {
    const result = await alice.call('sparqlEndpoint.query', {
      query: `
        SELECT ?type
        WHERE {
          GRAPH <${projectUri}> {
            <${projectUri}> a ?type
          }
        }
      `,
      username: 'alice',
      accept: MIME_TYPES.JSON
    });

    expect(result).toMatchObject([
      {
        type: {
          termType: 'NamedNode',
          value: 'http://virtual-assembly.org/ontologies/pair#Project'
        }
      }
    ]);
  });

  test('Alice can post to her own outbox', async () => {
    await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: 'Like',
      object: projectUri
    });

    const outboxMenu = await alice.call('activitypub.collection.get', {
      resourceUri: alice.outbox
    });

    await expect(
      alice.call('activitypub.collection.get', {
        resourceUri: alice.outbox,
        afterEq: new URL(outboxMenu?.first).searchParams.get('afterEq')
      })
    ).resolves.toMatchObject({
      type: 'OrderedCollectionPage',
      orderedItems: expect.arrayContaining([
        expect.objectContaining({
          type: 'Like',
          object: projectUri
        })
      ])
    });
  }, 80000);
});
