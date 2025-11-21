import waitForExpect from 'wait-for-expect';
import { connectPodProvider, clearAllData, createAccount } from './initialize.ts';
jest.setTimeout(80000);

describe('Test type indexes creation', () => {
  let podProvider: any, alice: any;

  beforeAll(async () => {
    await clearAllData();
    podProvider = await connectPodProvider();
    alice = await createAccount(podProvider, 'alice');
  }, 80000);

  afterAll(async () => {
    await podProvider.stop();
  });

  test('Public TypeIndex has been created', async () => {
    const aliceData = await alice.call('ldp.resource.get', { resourceUri: alice.id });
    expect(aliceData['solid:publicTypeIndex']).not.toBeNull();

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
