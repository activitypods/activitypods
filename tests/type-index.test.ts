import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { MIME_TYPES } from '@semapps/mime-types';
import { connectPodProvider, clearAllData } from './initialize.ts';
jest.setTimeout(80000);
const NUM_PODS = 1;

describe('Test pods creation', () => {
  let actors: any = [],
    podProvider: any,
    alice: any;

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
          meta: { ...options.meta, webId, dataset: actors[i].preferredUsername }
        });
    }

    alice = actors[1];
  }, 80000);

  afterAll(async () => {
    await podProvider.stop();
  });

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
          'solid:instanceContainer': urlJoin(alice.id, '/data/vcard/individual')
        })
      );
    });
  }, 80000);
});
