import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { ServiceBroker } from 'moleculer';
import {
  connectPodProvider,
  clearAllData,
  installApp,
  initializeAppServer,
  createTestActor,
  getTestApp
} from './initialize.ts';
import ExampleAppService from './apps/example.app.ts';
import ExampleAppV2Service from './apps/example-v2.app.ts';
import * as CONFIG from './config.ts';
import { TestActor, TestApp } from './utilTypes.js';

jest.setTimeout(80000);

describe('Test app upgrade', () => {
  let podProvider: ServiceBroker,
    appServer: ServiceBroker,
    alice: TestActor,
    app: TestApp,
    oldAppData: any,
    requiredAccessNeedGroup: any,
    optionalAccessNeedGroup: any;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();
    alice = await createTestActor(podProvider, 'alice');

    appServer = await initializeAppServer(3001, 'app', 'app_settings', 1, ExampleAppService);
    await appServer.start();
    app = await getTestApp(appServer);

    await installApp(alice, app.id);
  }, 80000);

  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
  });

  test('Application description is modified', async () => {
    oldAppData = await app.call('app.get');

    await appServer.stop();

    appServer = await initializeAppServer(3001, 'app', 'app_settings', 1, ExampleAppV2Service);
    await appServer.start();

    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      app = await getTestApp(appServer);
      expect(app).toMatchObject({
        'interop:applicationName': 'Example App v2'
      });
    });
  });

  test('Access needs have been changed', async () => {
    // The access need groups URIs have changed after upgrade (for the required access needs)
    expect(app['interop:hasAccessNeedGroup']).not.toEqual(oldAppData['interop:hasAccessNeedGroup']);

    for (const accessNeedUri of app['interop:hasAccessNeedGroup']) {
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
