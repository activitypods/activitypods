import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { connectPodProvider, clearAllData } from './initialize.ts';
jest.setTimeout(80000);

describe('Test groups creation', () => {
  let podProvider: any, alice: any, group: any;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    const actorData = require('./data/actor1.json');
    const { webId } = await podProvider.call('auth.signup', actorData);
    alice = await podProvider.call(
      'activitypub.actor.awaitCreateComplete',
      { actorUri: webId },
      { meta: { dataset: actorData.username } }
    );
  }, 80000);

  afterAll(async () => {
    await podProvider.stop();
  });

  test('Alice can create a group', async () => {
    await podProvider.call(
      'groups.create',
      { id: 'acme', type: 'foaf:Organization' },
      { meta: { webId: alice.id, dataset: alice.preferredUsername } }
    );

    group = await podProvider.call(
      'activitypub.actor.awaitCreateComplete',
      { actorUri: urlJoin(new URL(alice.id).origin, 'acme') },
      { meta: { dataset: 'acme' } }
    );

    expect(group.type).toEqual(expect.arrayContaining(['foaf:Organization', 'Organization']));
    expect(group['pim:storage']).toBe(urlJoin(group.id, 'data'));
  });

  test('The group has keys, registries and type indexes', async () => {
    await waitForExpect(async () => {
      const webIdData = await podProvider.call('webid.get', { resourceUri: group.id });
      expect(webIdData.publicKey).toBeDefined();
      expect(webIdData['interop:hasAuthorizationAgent']).toBeDefined();
      expect(webIdData['interop:hasRegistrySet']).toBeDefined();
      expect(webIdData['solid:publicTypeIndex']).toBeDefined();
      expect(webIdData.endpoints).toMatchObject({
        proxyUrl: urlJoin(group.id, 'proxy'),
        'void:sparqlEndpoint': urlJoin(group.id, 'sparql')
      });
    });
  });

  test('The group has its collections', async () => {
    await expect(
      podProvider.call('activitypub.collection.get', { resourceUri: group.outbox, webId: 'system' })
    ).resolves.toMatchObject({ id: group.outbox });
  });

  test('The group has no profile', async () => {
    const webIdData = await podProvider.call('webid.get', { resourceUri: group.id });
    expect(webIdData.url).toBeUndefined();
  });

  test('Alice has full rights on the group storage', async () => {
    await expect(
      podProvider.call('webacl.resource.hasRights', {
        resourceUri: group['pim:storage'],
        rights: { read: true, write: true, control: true },
        webId: alice.id
      })
    ).resolves.toMatchObject({ read: true, write: true, control: true });
  });
});
