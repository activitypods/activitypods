const urlJoin = require('url-join');
const waitForExpect = require('wait-for-expect');
const { MIME_TYPES } = require('@semapps/mime-types');
const { connectPodProvider, clearAllData } = require('./initialize');

jest.setTimeout(80000);

const NUM_PODS = 1;

describe('Test pods creation', () => {
  let actors = [],
    podProvider,
    alice,
    projectUri;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    for (let i = 1; i <= NUM_PODS; i++) {
      const actorData = require(`./data/actor${i}.json`);
      const { webId } = await podProvider.call('auth.signup', actorData);
      actors[i] = await podProvider.call(
        'activitypub.actor.awaitCreateComplete',
        {
          actorUri: webId,
          additionalKeys: ['url']
        },
        { meta: { dataset: actorData.username } }
      );
      actors[i].call = (actionName, params, options = {}) =>
        podProvider.call(actionName, params, {
          ...options,
          meta: { ...options.meta, webId, dataset: actors[i].preferredUsername }
        });
    }

    alice = actors[1];
  }, 80000);

  afterAll(async () => {
    await podProvider.stop();
  });

  test('Alice WebID has the required informations', async () => {
    expect(alice['pim:storage']).toBe(urlJoin(alice.id, 'data'));
    expect(alice['solid:oidcIssuer']).toBe(new URL(alice.id).origin);
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
    await expect(
      alice.call('ldp.resource.get', {
        resourceUri: alice.url,
        accept: MIME_TYPES.JSON
      })
    ).resolves.toMatchObject({
      describes: alice.id
    });
  }, 80000);

  test('Alice TypeIndex has been created', async () => {
    const aliceData = await alice.call('ldp.resource.get', {
      resourceUri: alice.id,
      accept: MIME_TYPES.JSON
    });

    const typeIndexUri = aliceData['solid:publicTypeIndex'];

    expect(typeIndexUri).not.toBeNull();

    // TypeRegistrations take time to be populated
    await waitForExpect(async () => {
      const typeIndex = await alice.call('type-indexes.get', {
        resourceUri: typeIndexUri,
        accept: MIME_TYPES.JSON
      });

      expect(typeIndex['solid:hasTypeRegistration']).toContainEqual(
        expect.objectContaining({
          'solid:forClass': expect.arrayContaining(['as:Profile', 'vcard:Individual']),
          'solid:instanceContainer': urlJoin(alice.id, '/data/vcard/individual'),
          'skos:prefLabel': 'Profiles',
          'apods:labelPredicate': 'vcard:given-name'
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

    await expect(
      alice.call('ldp.resource.get', {
        resourceUri: projectUri,
        accept: MIME_TYPES.JSON
      })
    ).resolves.toMatchObject({
      type: 'pair:Project',
      'pair:label': 'ActivityPods'
    });
  }, 80000);

  test('Alice can query through the SPARQL endpoint of her pod', async () => {
    const result = await alice.call('sparqlEndpoint.query', {
      query: `
        SELECT ?type
        WHERE {
          <${projectUri}> a ?type
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

    await expect(
      alice.call('activitypub.collection.get', {
        resourceUri: alice.outbox,
        page: 1
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
