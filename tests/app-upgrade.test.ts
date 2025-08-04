// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { MIME_TYPES } from '@semapps/mime-types';

// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import { connectPodProvider, clearAllData, installApp, createActor, initializeAppServer } from './initialize.ts';

// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import ExampleAppService from './apps/example.app.ts';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import ExampleAppV2Service from './apps/example-v2.app.ts';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import CONFIG from './config.ts';
// @ts-expect-error TS(2304): Cannot find name 'jest'.
jest.setTimeout(80000);
const APP_URI = 'http://localhost:3001/app';

// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('Test app upgrade', () => {
  let podProvider: any,
    alice: any,
    appServer: any,
    oldApp: any,
    app: any,
    requiredAccessNeedGroup: any,
    optionalAccessNeedGroup;

  // @ts-expect-error TS(2304): Cannot find name 'beforeAll'.
  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
    await appServer.start();

    alice = await createActor(podProvider, 'alice');

    await installApp(alice, APP_URI);
  }, 80000);

  // @ts-expect-error TS(2304): Cannot find name 'afterAll'.
  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Application description is modified', async () => {
    oldApp = await appServer.call('ldp.resource.get', {
      resourceUri: APP_URI,
      accept: MIME_TYPES.JSON
    });

    await appServer.stop();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppV2Service);

    await appServer.start();

    await waitForExpect(async () => {
      app = await appServer.call('ldp.resource.get', {
        resourceUri: APP_URI,
        accept: MIME_TYPES.JSON
      });
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(app).toMatchObject({
        'interop:applicationName': 'Example App v2'
      });
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Access needs have been changed', async () => {
    // The access need groups URIs have changed after upgrade (for the required access needs)
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(app['interop:hasAccessNeedGroup']).not.toEqual(oldApp['interop:hasAccessNeedGroup']);

    for (const accessNeedUri of app['interop:hasAccessNeedGroup']) {
      const accessNeedGroup = await appServer.call('ldp.resource.get', {
        resourceUri: accessNeedUri,
        accept: MIME_TYPES.JSON
      });
      if (accessNeedGroup['interop:accessNecessity'] === 'interop:AccessRequired') {
        requiredAccessNeedGroup = accessNeedGroup;
      } else {
        optionalAccessNeedGroup = accessNeedGroup;
      }
    }
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(requiredAccessNeedGroup).toMatchObject({
      type: 'interop:AccessNeedGroup',
      'interop:accessNecessity': 'interop:AccessRequired',
      'interop:accessScenario': 'interop:PersonalAccess',
      'interop:authenticatedAs': 'interop:SocialAgent',
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      'interop:hasAccessNeed': expect.anything()
    });

    // We reduced the number of special rights from 7 to 6
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(requiredAccessNeedGroup['apods:hasSpecialRights']).toHaveLength(6);

    const accessNeed = await appServer.call('ldp.resource.get', {
      resourceUri: requiredAccessNeedGroup['interop:hasAccessNeed'],
      accept: MIME_TYPES.JSON
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(accessNeed).toMatchObject({
      type: 'interop:AccessNeed',
      'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
      'interop:accessNecessity': 'interop:AccessRequired'
    });

    // We removed acl:Control permissions
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(accessNeed['interop:accessMode']).toEqual(['acl:Read', 'acl:Write']);
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('User upgrade and accept all required access needs', async () => {
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      alice.call('registration-endpoint.upgrade', {
        appUri: APP_URI,
        acceptedAccessNeeds: requiredAccessNeedGroup['interop:hasAccessNeed'],
        acceptedSpecialRights: requiredAccessNeedGroup['apods:hasSpecialRights']
      })
    ).resolves.not.toThrow();
  });
});
