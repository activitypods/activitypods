const path = require('path');
const urlJoin = require('url-join');
const waitForExpect = require('wait-for-expect');
const { MIME_TYPES } = require('@semapps/mime-types');
const { initialize, initializeAppServer, clearDataset, listDatasets, installApp } = require('./initialize');
const { interopContext } = require('@activitypods/core');
const ExampleAppService = require('./apps/example.app');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');

jest.setTimeout(80000);

const APP_URI = 'http://localhost:3001/actors/app';

describe('Test app installation', () => {
  let podServer,
    alice,
    appServer,
    app,
    requiredAccessNeedGroup,
    optionalAccessNeedGroup,
    requiredAccessGrant,
    optionalAccessGrant,
    appRegistration;

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
        jsonContext: interopContext,
        accept: MIME_TYPES.JSON
      });
      expect(app).toMatchObject({
        '@type': expect.arrayContaining(['interop:Application']),
        'interop:applicationName': 'Example App',
        'interop:applicationDescription': 'An ActivityPods app for integration tests',
        'interop:hasAccessNeedGroup': expect.anything()
      });
    });

    let accessNeedGroup;
    for (const accessNeedUri of app['interop:hasAccessNeedGroup']) {
      accessNeedGroup = await appServer.call('ldp.resource.get', {
        resourceUri: accessNeedUri,
        jsonContext: interopContext,
        accept: MIME_TYPES.JSON
      });
      if (accessNeedGroup['interop:accessNecessity'] === 'interop:AccessRequired') {
        requiredAccessNeedGroup = accessNeedGroup;
      } else {
        optionalAccessNeedGroup = accessNeedGroup;
      }
    }

    // REQUIRED ACCESS NEEDS

    expect(requiredAccessNeedGroup).toMatchObject({
      '@type': 'interop:AccessNeedGroup',
      'interop:accessNecessity': 'interop:AccessRequired',
      'interop:accessScenario': 'interop:PersonalAccess',
      'interop:authenticatedAs': 'interop:SocialAgent',
      'interop:hasAccessNeed': expect.anything(),
      'apods:hasSpecialRights': 'apods:ReadInbox'
    });

    await expect(
      appServer.call('ldp.resource.get', {
        resourceUri: requiredAccessNeedGroup['interop:hasAccessNeed'],
        jsonContext: interopContext,
        accept: MIME_TYPES.JSON
      })
    ).resolves.toMatchObject({
      '@type': 'interop:AccessNeed',
      'apods:registeredClass': 'https://www.w3.org/ns/activitystreams#Event',
      'interop:accessNecessity': 'interop:AccessRequired',
      'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Create'])
    });

    // OPTIONAL ACCESS NEEDS

    expect(optionalAccessNeedGroup).toMatchObject({
      '@type': 'interop:AccessNeedGroup',
      'interop:accessNecessity': 'interop:AccessOptional',
      'interop:accessScenario': 'interop:PersonalAccess',
      'interop:authenticatedAs': 'interop:SocialAgent',
      'interop:hasAccessNeed': expect.anything(),
      'apods:hasSpecialRights': 'apods:SendNotification'
    });

    await expect(
      appServer.call('ldp.resource.get', {
        resourceUri: optionalAccessNeedGroup['interop:hasAccessNeed'],
        jsonContext: interopContext,
        accept: MIME_TYPES.JSON
      })
    ).resolves.toMatchObject({
      '@type': 'interop:AccessNeed',
      'apods:registeredClass': 'https://www.w3.org/ns/activitystreams#Location',
      'interop:accessNecessity': 'interop:AccessOptional',
      'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Create'])
    });
  });

  test('User installs app and grants all access needs', async () => {
    await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      '@context': ['https://www.w3.org/ns/activitystreams', interopContext],
      '@type': 'apods:Install',
      object: APP_URI,
      'apods:acceptedAccessNeeds': [
        requiredAccessNeedGroup['interop:hasAccessNeed'],
        optionalAccessNeedGroup['interop:hasAccessNeed']
      ],
      'apods:acceptedSpecialRights': [
        requiredAccessNeedGroup['apods:hasSpecialRights'],
        optionalAccessNeedGroup['apods:hasSpecialRights']
      ]
    });

    let appRegistrationUri, creationActivityUri;

    await waitForExpect(async () => {
      const outbox = await alice.call('activitypub.collection.get', {
        collectionUri: alice.outbox,
        page: 1
      });

      expect(outbox?.orderedItems[0]).toMatchObject({
        type: 'Create',
        object: expect.anything(),
        to: APP_URI
      });

      creationActivityUri = outbox?.orderedItems[0]?.id;
      appRegistrationUri = outbox?.orderedItems[0]?.object;
    });

    // Get the app registration from the app server (it should be public like AccessGrants and DataGrants)
    appRegistration = await appServer.call('ldp.remote.get', {
      resourceUri: appRegistrationUri,
      jsonContext: interopContext,
      accept: MIME_TYPES.JSON
    });

    expect(appRegistration).toMatchObject({
      '@type': 'interop:ApplicationRegistration',
      'interop:registeredAgent': APP_URI,
      'interop:registeredBy': alice.id,
      'interop:hasAccessGrant': expect.arrayContaining([])
    });

    const accessGrants = await Promise.all(
      appRegistration['interop:hasAccessGrant'].map(accessGrantUri =>
        appServer.call('ldp.remote.get', {
          resourceUri: accessGrantUri,
          jsonContext: interopContext,
          accept: MIME_TYPES.JSON
        })
      )
    );

    requiredAccessGrant = accessGrants.find(g => g['interop:hasAccessNeedGroup'] === requiredAccessNeedGroup['@id']);
    optionalAccessGrant = accessGrants.find(g => g['interop:hasAccessNeedGroup'] === optionalAccessNeedGroup['@id']);

    expect(requiredAccessGrant).toMatchObject({
      '@type': 'interop:AccessGrant',
      'interop:grantedBy': alice.id,
      'interop:grantee': APP_URI,
      'interop:hasAccessNeedGroup': requiredAccessNeedGroup['@id']
    });

    await expect(
      appServer.call('ldp.remote.get', {
        resourceUri: requiredAccessGrant['interop:hasDataGrant'],
        jsonContext: interopContext,
        accept: MIME_TYPES.JSON
      })
    ).resolves.toMatchObject({
      '@type': 'interop:DataGrant',
      'apods:registeredClass': 'https://www.w3.org/ns/activitystreams#Event',
      'apods:registeredContainer': urlJoin(alice.id, 'data/as/event'),
      'interop:dataOwner': alice.id,
      'interop:grantee': APP_URI,
      'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Create']),
      'interop:satisfiesAccessNeed': requiredAccessNeedGroup['interop:hasAccessNeed'],
      'interop:scopeOfGrant': 'interop:All'
    });

    expect(optionalAccessGrant).toMatchObject({
      '@type': 'interop:AccessGrant',
      'interop:grantedBy': alice.id,
      'interop:grantee': APP_URI,
      'interop:hasAccessNeedGroup': optionalAccessNeedGroup['@id']
    });

    await expect(
      appServer.call('ldp.remote.get', {
        resourceUri: optionalAccessGrant['interop:hasDataGrant'],
        jsonContext: interopContext,
        accept: MIME_TYPES.JSON
      })
    ).resolves.toMatchObject({
      '@type': 'interop:DataGrant',
      'apods:registeredClass': 'https://www.w3.org/ns/activitystreams#Location',
      'apods:registeredContainer': urlJoin(alice.id, 'data/as/location'),
      'interop:dataOwner': alice.id,
      'interop:grantee': APP_URI,
      'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Create']),
      'interop:satisfiesAccessNeed': optionalAccessNeedGroup['interop:hasAccessNeed'],
      'interop:scopeOfGrant': 'interop:All'
    });

    await waitForExpect(async () => {
      const inbox = await alice.call('activitypub.collection.get', {
        collectionUri: alice.inbox,
        page: 1
      });

      expect(inbox?.orderedItems[0]).toMatchObject({
        type: ACTIVITY_TYPES.ACCEPT,
        object: creationActivityUri
      });
    });
  });

  test('Containers are created according to access needs', async () => {
    await expect(
      alice.call('ldp.container.exist', {
        containerUri: urlJoin(alice.id, 'data/as')
      })
    ).resolves.toBeTruthy();

    await expect(
      alice.call('ldp.container.exist', {
        containerUri: urlJoin(alice.id, 'data/as/event')
      })
    ).resolves.toBeTruthy();

    await expect(
      alice.call('ldp.container.exist', {
        containerUri: urlJoin(alice.id, 'data/as/location')
      })
    ).resolves.toBeTruthy();

    await expect(
      alice.call('webacl.resource.getRights', {
        resourceUri: urlJoin(alice.id, 'data/as/event'),
        accept: MIME_TYPES.JSON,
        webId: APP_URI
      })
    ).resolves.toMatchObject({
      '@graph': expect.arrayContaining([
        expect.objectContaining({
          'acl:agent': APP_URI,
          'acl:mode': 'acl:Read'
        }),
        expect.objectContaining({
          'acl:agent': APP_URI,
          'acl:mode': 'acl:Write'
        })
      ])
    });

    await expect(
      alice.call('webacl.resource.getRights', {
        resourceUri: urlJoin(alice.id, 'data/as/location'),
        accept: MIME_TYPES.JSON,
        webId: APP_URI
      })
    ).resolves.toMatchObject({
      '@graph': expect.arrayContaining([
        expect.objectContaining({
          'acl:agent': APP_URI,
          'acl:mode': 'acl:Read'
        }),
        expect.objectContaining({
          'acl:agent': APP_URI,
          'acl:mode': 'acl:Write'
        })
      ])
    });
  });

  test('User installs same app a second time and get an error', async () => {
    const [creationActivityUri] = await installApp(
      alice,
      APP_URI,
      requiredAccessNeedGroup['interop:hasAccessNeed'],
      requiredAccessNeedGroup['apods:hasSpecialRights']
    );

    await waitForExpect(async () => {
      const inbox = await alice.call('activitypub.collection.get', {
        collectionUri: alice.inbox,
        page: 1
      });

      expect(inbox?.orderedItems[0]).toMatchObject({
        type: ACTIVITY_TYPES.REJECT,
        object: creationActivityUri,
        summary: 'User already has an application registration. Update or delete it.'
      });
    });
  });

  test('User uninstalls app', async () => {
    await alice.call('activitypub.outbox.post', {
      collectionUri: alice.outbox,
      '@context': ['https://www.w3.org/ns/activitystreams', interopContext],
      type: ACTIVITY_TYPES.UNDO,
      object: {
        type: 'apods:Install',
        object: APP_URI
      }
    });

    let appRegistrationUri;

    await waitForExpect(async () => {
      const outbox = await alice.call('activitypub.collection.get', {
        collectionUri: alice.outbox,
        page: 1
      });

      expect(outbox?.orderedItems[0]).toMatchObject({
        type: ACTIVITY_TYPES.DELETE,
        object: expect.anything(),
        to: APP_URI
      });

      appRegistrationUri = outbox?.orderedItems[0]?.object;
    });

    // The ApplicationRegistration should be deleted
    await waitForExpect(async () => {
      await expect(
        alice.call('ldp.resource.get', {
          resourceUri: appRegistrationUri,
          accept: MIME_TYPES.JSON
        })
      ).rejects.toThrow();
    });

    // It should be deleted on the app server as well
    await waitForExpect(async () => {
      await expect(
        appServer.call('ldp.remote.getStored', {
          resourceUri: appRegistrationUri,
          accept: MIME_TYPES.JSON,
          webId: 'system'
        })
      ).rejects.toThrow();
    });
  });

  test('User installs app and do not grant required access needs', async () => {
    const [creationActivityUri, appRegistrationUri] = await installApp(
      alice,
      APP_URI,
      optionalAccessNeedGroup['interop:hasAccessNeed'],
      optionalAccessNeedGroup['apods:hasSpecialRights']
    );

    await waitForExpect(async () => {
      const inbox = await alice.call('activitypub.collection.get', {
        collectionUri: alice.inbox,
        page: 1
      });

      expect(inbox?.orderedItems[0]).toMatchObject({
        type: ACTIVITY_TYPES.REJECT,
        object: creationActivityUri,
        summary: 'One or more required access needs have not been granted'
      });
    });

    // The ApplicationRegistration should be deleted
    await waitForExpect(async () => {
      await expect(
        alice.call('ldp.resource.get', {
          resourceUri: appRegistrationUri,
          accept: MIME_TYPES.JSON
        })
      ).rejects.toThrow();
    });
  });

  test('User installs app and only grant required access needs', async () => {
    const [creationActivityUri] = await installApp(
      alice,
      APP_URI,
      requiredAccessNeedGroup['interop:hasAccessNeed'],
      requiredAccessNeedGroup['apods:hasSpecialRights']
    );

    await waitForExpect(async () => {
      const inbox = await alice.call('activitypub.collection.get', {
        collectionUri: alice.inbox,
        page: 1
      });

      expect(inbox?.orderedItems[0]).toMatchObject({
        type: ACTIVITY_TYPES.ACCEPT,
        object: creationActivityUri
      });
    });
  });
});
