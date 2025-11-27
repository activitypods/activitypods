import waitForExpect from 'wait-for-expect';
import { ServiceBroker } from 'moleculer';
import { connectPodProvider, clearAllData, createTestActor } from './initialize.ts';
import { TestActor } from './utilTypes.js';

jest.setTimeout(80000);

describe('Test type indexes creation', () => {
  let podProvider: ServiceBroker, alice: TestActor;

  beforeAll(async () => {
    await clearAllData();
    podProvider = await connectPodProvider();
    alice = await createTestActor(podProvider, 'alice');
  }, 80000);

  afterAll(async () => {
    await podProvider.stop();
  });

  test('Public TypeIndex has been created', async () => {
    expect(alice['solid:publicTypeIndex']).not.toBeNull();

    // TypeRegistrations take time to be populated
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      const typeIndex = await alice.call('public-type-index.get');

      expect(typeIndex['@graph']).toContainEqual(
        expect.objectContaining({
          'solid:forClass': expect.arrayContaining(['as:Profile', 'vcard:Individual']),
          'solid:instanceContainer': expect.anything()
        })
      );
    });
  }, 80000);
});
