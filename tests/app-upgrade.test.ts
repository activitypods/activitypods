import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { ServiceBroker } from 'moleculer';
import { connectPodProvider, clearAllData, installApp, initializeAppServer, createAccount } from './initialize.ts';
import ExampleAppService from './apps/example.app.ts';
import ExampleAppV2Service from './apps/example-v2.app.ts';
import * as CONFIG from './config.ts';

jest.setTimeout(80000);
const APP_URI = 'http://localhost:3001/app/webid';

describe('Test app upgrade', () => {
  let podProvider: ServiceBroker,
    alice: any,
    app: any,
    appData: any,
    oldAppData: any,
    requiredAccessNeedGroup: any,
    optionalAccessNeedGroup: any;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();
    alice = await createAccount(podProvider, 'alice');

    app = await initializeAppServer(3001, 'app', 'app_settings', 1, ExampleAppService);

    await installApp(alice, APP_URI);
  }, 80000);

  afterAll(async () => {
    await podProvider.stop();
    await app.stop();
  });

  test('Application description is modified', async () => {
    oldAppData = await app.call('app.get');

    await app.stop();

    app = await initializeAppServer(3001, 'app', 'app_settings', 1, ExampleAppV2Service);

    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      appData = await app.call('app.get');
      expect(appData).toMatchObject({
        'interop:applicationName': 'Example App v2'
      });
    });
  });

  test('Access needs have been changed', async () => {
    // The access need groups URIs have changed after upgrade (for the required access needs)
    expect(appData['interop:hasAccessNeedGroup']).not.toEqual(oldAppData['interop:hasAccessNeedGroup']);

    for (const accessNeedUri of appData['interop:hasAccessNeedGroup']) {
      const accessNeedGroup = await app.call('ldp.resource.get', { resourceUri: accessNeedUri });
      if (accessNeedGroup['interop:accessNecessity'] === 'interop:AccessRequired') {
        requiredAccessNeedGroup = accessNeedGroup;
      } else {
        optionalAccessNeedGroup = accessNeedGroup;
      }
    }
    expect(requiredAccessNeedGroup).toMatchObject({
      type: 'interop:AccessNeedGroup',
      'interop:accessNecessity': 'interop:AccessRequired',
      'interop:accessScenario': 'interop:PersonalAccess',
      'interop:authenticatedAs': 'interop:SocialAgent',
      'interop:hasAccessNeed': expect.anything()
    });

    // We reduced the number of special rights from 7 to 6
    expect(requiredAccessNeedGroup['apods:hasSpecialRights']).toHaveLength(6);

    const accessNeed = await app.call('ldp.resource.get', {
      resourceUri: requiredAccessNeedGroup['interop:hasAccessNeed']
    });

    expect(accessNeed).toMatchObject({
      type: 'interop:AccessNeed',
      'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
      'interop:accessNecessity': 'interop:AccessRequired'
    });

    // We removed acl:Control permissions
    expect(accessNeed['interop:accessMode']).toEqual(['acl:Read', 'acl:Write']);
  });

  test('User upgrade and accept all required access needs', async () => {
    await expect(
      alice.call('registration-endpoint.upgrade', {
        appUri: app.id,
        acceptedAccessNeeds: requiredAccessNeedGroup['interop:hasAccessNeed'],
        acceptedSpecialRights: requiredAccessNeedGroup['apods:hasSpecialRights']
      })
    ).resolves.not.toThrow();
  });
});
