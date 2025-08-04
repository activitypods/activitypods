// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { MIME_TYPES } from '@semapps/mime-types';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import { connectPodProvider, clearAllData } from './initialize.ts';
// @ts-expect-error TS(2304): Cannot find name 'jest'.
jest.setTimeout(80000);
const NUM_PODS = 1;

// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('Test pods creation', () => {
  let actors: any = [],
    podProvider: any,
    alice: any,
    projectUri: any;

  // @ts-expect-error TS(2304): Cannot find name 'beforeAll'.
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
      actors[i].call = (actionName: any, params: any, options = {}) =>
        podProvider.call(actionName, params, {
          ...options,
          // @ts-expect-error TS(2339): Property 'meta' does not exist on type '{}'.
          meta: { ...options.meta, webId, dataset: actors[i].preferredUsername }
        });
    }

    alice = actors[1];
  }, 80000);

  // @ts-expect-error TS(2304): Cannot find name 'afterAll'.
  afterAll(async () => {
    await podProvider.stop();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Alice WebID has the required informations', async () => {
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(alice['pim:storage']).toBe(urlJoin(alice.id, 'data'));
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(alice['solid:oidcIssuer']).toBe(new URL(alice.id).origin);
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(alice['solid:publicTypeIndex']).toBeDefined();
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(alice['interop:hasAuthorizationAgent']).toBeDefined();
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(alice['interop:hasRegistrySet']).toBeDefined();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Alice collections can be fetched', async () => {
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      alice.call('activitypub.collection.get', {
        resourceUri: alice.outbox
      })
    ).resolves.toMatchObject({
      type: 'OrderedCollection',
      id: alice.outbox
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      alice.call('activitypub.collection.get', {
        resourceUri: alice.inbox
      })
    ).resolves.toMatchObject({
      type: 'OrderedCollection',
      id: alice.inbox
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      alice.call('activitypub.collection.get', {
        resourceUri: alice.followers
      })
    ).resolves.toMatchObject({
      type: 'Collection',
      id: alice.followers
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      alice.call('activitypub.collection.get', {
        resourceUri: alice.following
      })
    ).resolves.toMatchObject({
      type: 'Collection',
      id: alice.following
    });
  }, 80000);

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Alice profile can be fetched', async () => {
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      alice.call('ldp.resource.get', {
        resourceUri: alice.url,
        accept: MIME_TYPES.JSON
      })
    ).resolves.toMatchObject({
      describes: alice.id
    });
  }, 80000);

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Alice TypeIndex has been created', async () => {
    const aliceData = await alice.call('ldp.resource.get', {
      resourceUri: alice.id,
      accept: MIME_TYPES.JSON
    });

    const typeIndexUri = aliceData['solid:publicTypeIndex'];

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(typeIndexUri).not.toBeNull();

    // TypeRegistrations take time to be populated
    await waitForExpect(async () => {
      const typeIndex = await alice.call('type-indexes.get', {
        resourceUri: typeIndexUri,
        accept: MIME_TYPES.JSON
      });

      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(typeIndex['solid:hasTypeRegistration']).toContainEqual(
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        expect.objectContaining({
          // @ts-expect-error TS(2304): Cannot find name 'expect'.
          'solid:forClass': expect.arrayContaining(['as:Profile', 'vcard:Individual']),
          'solid:instanceContainer': urlJoin(alice.id, '/data/vcard/individual')
        })
      );
    });
  }, 80000);

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
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

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(result).toMatchObject([
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
    await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: 'Like',
      object: projectUri
    });

    const outboxMenu = await alice.call('activitypub.collection.get', {
      resourceUri: alice.outbox
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      alice.call('activitypub.collection.get', {
        resourceUri: alice.outbox,
        afterEq: new URL(outboxMenu?.first).searchParams.get('afterEq')
      })
    ).resolves.toMatchObject({
      type: 'OrderedCollectionPage',
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      orderedItems: expect.arrayContaining([
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        expect.objectContaining({
          type: 'Like',
          object: projectUri
        })
      ])
    });
  }, 80000);
});
