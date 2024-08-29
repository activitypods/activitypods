const waitForExpect = require('wait-for-expect');
const { MIME_TYPES } = require('@semapps/mime-types');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');
const { initializeAppServer, clearDataset, listDatasets, installApp, initializePodProvider } = require('./initialize');
const ExampleAppService = require('./apps/example.app');
const ExampleAppV2Service = require('./apps/example-v2.app');

jest.setTimeout(80000);

const APP_URI = 'http://localhost:3001/app';

describe('Test app upgrade', () => {
  let podProvider, alice, appServer, oldApp, app, requiredAccessNeedGroup;

  beforeAll(async () => {
    const datasets = await listDatasets();
    for (let dataset of datasets) {
      await clearDataset(dataset);
    }

    podProvider = await initializePodProvider();

    const actorData = require(`./data/actor1.json`);
    const { webId } = await podProvider.call('auth.signup', actorData);
    alice = await podProvider.call(
      'activitypub.actor.awaitCreateComplete',
      {
        actorUri: webId,
        additionalKeys: ['url']
      },
      { meta: { dataset: actorData.username } }
    );
    alice.call = (actionName, params, options = {}) =>
      podProvider.call(actionName, params, {
        ...options,
        meta: { ...options.meta, webId, dataset: alice.preferredUsername }
      });

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
    await appServer.start();

    await installApp(alice, APP_URI);
  }, 80000);

  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
  });

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
      expect(app).toMatchObject({
        'interop:applicationName': 'Example App v2'
      });
    });
  });

  test('Access needs have been changed', async () => {
    // The access need groups URIs have changed after upgrade (for the required access needs)
    expect(app['interop:hasAccessNeedGroup']).not.toEqual(oldApp['interop:hasAccessNeedGroup']);

    let accessNeedGroup;
    for (const accessNeedUri of app['interop:hasAccessNeedGroup']) {
      accessNeedGroup = await appServer.call('ldp.resource.get', {
        resourceUri: accessNeedUri,
        accept: MIME_TYPES.JSON
      });
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

    const accessNeed = await appServer.call('ldp.resource.get', {
      resourceUri: requiredAccessNeedGroup['interop:hasAccessNeed'],
      accept: MIME_TYPES.JSON
    });

    expect(accessNeed).toMatchObject({
      type: 'interop:AccessNeed',
      'apods:registeredClass': 'as:Event',
      'interop:accessNecessity': 'interop:AccessRequired'
    });

    // We removed acl:Control permissions
    expect(accessNeed['interop:accessMode']).toEqual(['acl:Read', 'acl:Write']);
  });

  test('User upgrade but does not accept all required access needs', async () => {
    await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: 'apods:Upgrade',
      object: APP_URI,
      'apods:acceptedAccessNeeds': [],
      'apods:acceptedSpecialRights': requiredAccessNeedGroup['apods:hasSpecialRights']
    });

    await waitForExpect(async () => {
      const inbox = await alice.call('activitypub.collection.get', {
        resourceUri: alice.inbox,
        page: 1
      });

      expect(inbox?.orderedItems[0]).toMatchObject({
        type: ACTIVITY_TYPES.REJECT,
        actor: APP_URI,
        summary: 'One or more required access needs have not been granted'
      });
    });
  });

  test('User upgrade and accept all required access needs', async () => {
    await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      type: 'apods:Upgrade',
      object: APP_URI,
      'apods:acceptedAccessNeeds': requiredAccessNeedGroup['interop:hasAccessNeed'],
      'apods:acceptedSpecialRights': requiredAccessNeedGroup['apods:hasSpecialRights']
    });

    await waitForExpect(async () => {
      const inbox = await alice.call('activitypub.collection.get', {
        resourceUri: alice.inbox,
        page: 1
      });

      expect(inbox?.orderedItems[0]).toMatchObject({
        type: ACTIVITY_TYPES.ACCEPT,
        actor: APP_URI
      });
    });
  });

  test('Types are correctly updated in the TypeIndex', async () => {
    const typeIndex = await alice.call('type-indexes.get', {
      resourceUri: alice['solid:publicTypeIndex'],
      accept: MIME_TYPES.JSON
    });

    // The prefLabel and openEndpoint must have changed
    expect(typeIndex['solid:hasTypeRegistration']).toContainEqual(
      expect.objectContaining({
        'solid:forClass': 'as:Event',
        'apods:defaultApp': APP_URI,
        'apods:availableApps': APP_URI,
        'skos:prefLabel': 'Meetings',
        'apods:openEndpoint': 'https://example.app/redirect'
      })
    );
  });
});
