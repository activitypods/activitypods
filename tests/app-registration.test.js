const path = require('path');
const waitForExpect = require('wait-for-expect');
const { MIME_TYPES } = require('@semapps/mime-types');
const { initialize, initializeAppServer, clearDataset, listDatasets } = require('./initialize');
const ExampleAppService = require('./apps/example.app');

jest.setTimeout(80000);

const APP_URI = 'http://localhost:3001/actors/app';

describe('Test app registration', () => {
  let podServer, alice, appServer, app;

  beforeAll(async () => {
    const datasets = await listDatasets();
    for (let dataset of datasets) {
      await clearDataset(dataset);
    }

    podServer = await initialize(3000, 'settings');
    await podServer.loadService(path.resolve(__dirname, './services/profiles.app.js'));
    await podServer.start();

    const actorData = require(`./data/actor1.json`);
    const { webId } = await podServer.call('auth.signup', actorData);
    alice = await podServer.call(
      'activitypub.actor.awaitCreateComplete',
      {
        actorUri: webId,
        additionalKeys: ['url']
      },
      { meta: { dataset: actorData.username } }
    );
    alice.call = (actionName, params, options = {}) =>
      podServer.call(actionName, params, {
        ...options,
        meta: { ...options.meta, webId, dataset: alice.preferredUsername }
      });

    appServer = await initializeAppServer(3001, 'app_settings');
    await appServer.createService(ExampleAppService);
    await appServer.start();
  }, 80000);

  afterAll(async () => {
    await podServer.stop();
    await appServer.stop();
  });

  test('App access needs are correctly declared', async () => {
    await waitForExpect(async () => {
      app = await appServer.call('ldp.resource.get', {
        resourceUri: APP_URI,
        accept: MIME_TYPES.JSON
      });
      expect(app).toMatchObject({
        type: expect.arrayContaining(['Application', 'interop:Application']),
        'interop:applicationName': 'Example App',
        'interop:applicationDescription': 'An ActivityPods app for integration tests',
        'interop:hasAccessNeedGroup': expect.arrayContaining([
          'http://localhost:3001/access-needs-groups/required',
          'http://localhost:3001/access-needs-groups/optional'
        ])
      });
    });

    // REQUIRED ACCESS NEEDS

    const requiredAccessNeedGroup = await appServer.call('ldp.resource.get', {
      resourceUri: 'http://localhost:3001/access-needs-groups/required',
      accept: MIME_TYPES.JSON
    });

    expect(requiredAccessNeedGroup).toMatchObject({
      type: 'interop:AccessNeedGroup',
      'interop:accessNecessity': 'interop:AccessRequired',
      'interop:accessScenario': 'interop:PersonalAccess',
      'interop:authenticatedAs': 'interop:SocialAgent',
      'interop:hasAccessNeeds': expect.anything(),
      'apods:hasSpecialAccessNeeds': 'apods:ReadInbox'
    });

    await expect(
      appServer.call('ldp.resource.get', {
        resourceUri: requiredAccessNeedGroup['interop:hasAccessNeeds'],
        accept: MIME_TYPES.JSON
      })
    ).resolves.toMatchObject({
      type: 'interop:AccessNeed',
      'apods:registeredClass': 'as:Event',
      'interop:accessNecessity': 'interop:AccessRequired',
      'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Create'])
    });

    // OPTIONAL ACCESS NEEDS

    const optionalAccessNeedGroup = await appServer.call('ldp.resource.get', {
      resourceUri: 'http://localhost:3001/access-needs-groups/optional',
      accept: MIME_TYPES.JSON
    });

    expect(optionalAccessNeedGroup).toMatchObject({
      type: 'interop:AccessNeedGroup',
      'interop:accessNecessity': 'interop:AccessOptional',
      'interop:accessScenario': 'interop:PersonalAccess',
      'interop:authenticatedAs': 'interop:SocialAgent',
      'interop:hasAccessNeeds': expect.anything(),
      'apods:hasSpecialAccessNeeds': 'apods:SendNotification'
    });

    await expect(
      appServer.call('ldp.resource.get', {
        resourceUri: optionalAccessNeedGroup['interop:hasAccessNeeds'],
        accept: MIME_TYPES.JSON
      })
    ).resolves.toMatchObject({
      type: 'interop:AccessNeed',
      'apods:registeredClass': 'as:Location',
      'interop:accessNecessity': 'interop:AccessOptional',
      'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Create'])
    });
  });
});
