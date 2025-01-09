const urlJoin = require('url-join');
const waitForExpect = require('wait-for-expect');
const { MIME_TYPES } = require('@semapps/mime-types');
const { arrayOf } = require('@semapps/ldp');
const { connectPodProvider, clearAllData, initializeAppServer, installApp } = require('./initialize');
const ExampleAppService = require('./apps/example.app');
const { ACTIVITY_TYPES } = require('@semapps/activitypub');

jest.setTimeout(80000);

const APP_URI = 'http://localhost:3001/app';
const APP2_URI = 'http://localhost:3002/app';

describe('Test app installation', () => {
  let podProvider,
    alice,
    appServer,
    appServer2,
    app,
    eventsContainerUri,
    placesContainerUri,
    requiredAccessNeedGroup,
    optionalAccessNeedGroup,
    requiredAccessGrant,
    optionalAccessGrant,
    appRegistration;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

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

    appServer2 = await initializeAppServer(3002, 'app2Data', 'app2_settings', 2, ExampleAppService);
    await appServer2.start();
  }, 80000);

  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
    await appServer2.stop();
  });

  test('App access needs are correctly declared', async () => {
    await waitForExpect(async () => {
      app = await appServer.call('ldp.resource.get', {
        resourceUri: APP_URI,
        accept: MIME_TYPES.JSON
      });
      expect(app).toMatchObject({
        type: expect.arrayContaining(['interop:Application']),
        'interop:applicationName': 'Example App',
        'interop:applicationDescription': 'An ActivityPods app for integration tests',
        'interop:hasAccessNeedGroup': expect.anything()
      });
    });

    let accessNeedGroup;
    for (const accessNeedUri of arrayOf(app['interop:hasAccessNeedGroup'])) {
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

    // REQUIRED ACCESS NEEDS

    expect(requiredAccessNeedGroup).toMatchObject({
      type: 'interop:AccessNeedGroup',
      'interop:accessNecessity': 'interop:AccessRequired',
      'interop:accessScenario': 'interop:PersonalAccess',
      'interop:authenticatedAs': 'interop:SocialAgent',
      'interop:hasAccessNeed': expect.anything(),
      'apods:hasSpecialRights': expect.arrayContaining(['apods:ReadInbox', 'apods:PostOutbox', 'apods:CreateWacGroup'])
    });

    await expect(
      appServer.call('ldp.resource.get', {
        resourceUri: requiredAccessNeedGroup['interop:hasAccessNeed'],
        accept: MIME_TYPES.JSON
      })
    ).resolves.toMatchObject({
      type: 'interop:AccessNeed',
      'apods:registeredClass': 'as:Event',
      'interop:accessNecessity': 'interop:AccessRequired',
      'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Write', 'acl:Control'])
    });

    // OPTIONAL ACCESS NEEDS

    expect(optionalAccessNeedGroup).toMatchObject({
      type: 'interop:AccessNeedGroup',
      'interop:accessNecessity': 'interop:AccessOptional',
      'interop:accessScenario': 'interop:PersonalAccess',
      'interop:authenticatedAs': 'interop:SocialAgent',
      'interop:hasAccessNeed': expect.anything()
    });

    await expect(
      appServer.call('ldp.resource.get', {
        resourceUri: optionalAccessNeedGroup['interop:hasAccessNeed'],
        accept: MIME_TYPES.JSON
      })
    ).resolves.toMatchObject({
      type: 'interop:AccessNeed',
      'apods:registeredClass': 'as:Place',
      'interop:accessNecessity': 'interop:AccessOptional',
      'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Append'])
    });
  });

  test('User installs app and grants all access needs', async () => {
    await expect(
      alice.call('auth-agent.install', {
        appUri: APP_URI,
        acceptedAccessNeeds: [
          requiredAccessNeedGroup['interop:hasAccessNeed'],
          optionalAccessNeedGroup['interop:hasAccessNeed']
        ],
        acceptedSpecialRights: [
          requiredAccessNeedGroup['apods:hasSpecialRights'],
          optionalAccessNeedGroup['apods:hasSpecialRights']
        ]
      })
    ).resolves.not.toThrow();

    let appRegistrationUri, creationActivityUri;

    // Ensure the app backend is informed of the installation
    await waitForExpect(async () => {
      const outbox = await alice.call('activitypub.collection.get', {
        resourceUri: alice.outbox,
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
      accept: MIME_TYPES.JSON
    });

    expect(appRegistration).toMatchObject({
      type: 'interop:ApplicationRegistration',
      'interop:registeredAgent': APP_URI,
      'interop:registeredBy': alice.id,
      'interop:hasAccessGrant': expect.arrayContaining([])
    });

    const accessGrants = await Promise.all(
      appRegistration['interop:hasAccessGrant'].map(accessGrantUri =>
        appServer.call('ldp.remote.get', {
          resourceUri: accessGrantUri,
          accept: MIME_TYPES.JSON
        })
      )
    );

    requiredAccessGrant = accessGrants.find(g => g['interop:hasAccessNeedGroup'] === requiredAccessNeedGroup.id);
    optionalAccessGrant = accessGrants.find(g => g['interop:hasAccessNeedGroup'] === optionalAccessNeedGroup.id);

    expect(requiredAccessGrant).toMatchObject({
      type: 'interop:AccessGrant',
      'interop:grantedBy': alice.id,
      'interop:grantee': APP_URI,
      'interop:hasAccessNeedGroup': requiredAccessNeedGroup.id
    });

    await expect(
      appServer.call('ldp.remote.get', {
        resourceUri: requiredAccessGrant['interop:hasDataGrant'],
        accept: MIME_TYPES.JSON
      })
    ).resolves.toMatchObject({
      type: 'interop:DataGrant',
      'apods:registeredClass': 'as:Event',
      'apods:registeredContainer': urlJoin(alice.id, 'data/as/event'),
      'interop:dataOwner': alice.id,
      'interop:grantee': APP_URI,
      'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Write', 'acl:Control']),
      'interop:satisfiesAccessNeed': requiredAccessNeedGroup['interop:hasAccessNeed'],
      'interop:scopeOfGrant': 'interop:All'
    });

    expect(optionalAccessGrant).toMatchObject({
      type: 'interop:AccessGrant',
      'interop:grantedBy': alice.id,
      'interop:grantee': APP_URI,
      'interop:hasAccessNeedGroup': optionalAccessNeedGroup.id
    });

    await expect(
      appServer.call('ldp.remote.get', {
        resourceUri: optionalAccessGrant['interop:hasDataGrant'],
        accept: MIME_TYPES.JSON
      })
    ).resolves.toMatchObject({
      type: 'interop:DataGrant',
      'apods:registeredClass': 'as:Place',
      'apods:registeredContainer': urlJoin(alice.id, 'data/as/place'),
      'interop:dataOwner': alice.id,
      'interop:grantee': APP_URI,
      'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Append']),
      'interop:satisfiesAccessNeed': optionalAccessNeedGroup['interop:hasAccessNeed'],
      'interop:scopeOfGrant': 'interop:All'
    });
  });

  test('Containers are created according to access needs', async () => {
    await expect(
      alice.call('ldp.container.exist', {
        containerUri: urlJoin(alice.id, 'data/as')
      })
    ).resolves.toBeTruthy();

    eventsContainerUri = urlJoin(alice.id, 'data/as/event');
    placesContainerUri = urlJoin(alice.id, 'data/as/place');

    await expect(
      alice.call('ldp.container.exist', {
        containerUri: eventsContainerUri
      })
    ).resolves.toBeTruthy();

    await expect(
      alice.call('ldp.container.exist', {
        containerUri: placesContainerUri
      })
    ).resolves.toBeTruthy();

    const eventsRights = await alice.call('webacl.resource.getRights', {
      resourceUri: urlJoin(alice.id, 'data/as/event'),
      accept: MIME_TYPES.JSON,
      webId: APP_URI
    });

    expect(eventsRights).toMatchObject({
      '@graph': expect.arrayContaining([
        expect.objectContaining({
          'acl:accessTo': eventsContainerUri,
          'acl:agent': APP_URI,
          'acl:mode': 'acl:Read'
        }),
        expect.objectContaining({
          'acl:accessTo': eventsContainerUri,
          'acl:agent': APP_URI,
          'acl:mode': 'acl:Write'
        })
      ])
    });

    const placesRights = await alice.call('webacl.resource.getRights', {
      resourceUri: urlJoin(alice.id, 'data/as/place'),
      accept: MIME_TYPES.JSON,
      webId: APP_URI
    });

    expect(placesRights).toMatchObject({
      '@graph': expect.arrayContaining([
        expect.objectContaining({
          'acl:agent': APP_URI,
          'acl:mode': 'acl:Read',
          'acl:accessTo': placesContainerUri
        })
      ])
    });

    expect(placesRights['@graph']).not.toContain([
      expect.objectContaining({
        'acl:agent': APP_URI,
        'acl:mode': 'acl:Write',
        'acl:accessTo': placesContainerUri
      })
    ]);
  });

  test('Resources created in the containers have the correct permissions', async () => {
    const eventUri = await alice.call('ldp.container.post', {
      containerUri: urlJoin(alice.id, 'data/as/event'),
      resource: {
        type: 'Event',
        name: 'Birthday party !'
      },
      contentType: MIME_TYPES.JSON
    });

    const eventsRights = await alice.call('webacl.resource.getRights', {
      resourceUri: eventUri,
      accept: MIME_TYPES.JSON,
      webId: 'system' // We must fetch as system, because we need control rights on the container to see all permissions
    });

    expect(eventsRights).toMatchObject({
      '@graph': expect.arrayContaining([
        expect.objectContaining({
          'acl:agent': APP_URI,
          'acl:default': eventsContainerUri,
          'acl:mode': 'acl:Read'
        }),
        expect.objectContaining({
          'acl:agent': APP_URI,
          'acl:default': eventsContainerUri,
          'acl:mode': 'acl:Write'
        }),
        expect.objectContaining({
          'acl:agent': APP_URI,
          'acl:default': eventsContainerUri,
          'acl:mode': 'acl:Control'
        })
      ])
    });

    const placeUri = await alice.call('ldp.container.post', {
      containerUri: urlJoin(alice.id, 'data/as/place'),
      resource: {
        type: 'Place',
        name: 'Home sweet home'
      },
      contentType: MIME_TYPES.JSON
    });

    const placesRights = await alice.call('webacl.resource.getRights', {
      resourceUri: placeUri,
      accept: MIME_TYPES.JSON,
      webId: 'system'
    });

    expect(placesRights).toMatchObject({
      '@graph': expect.arrayContaining([
        expect.objectContaining({
          'acl:agent': APP_URI,
          'acl:mode': 'acl:Read',
          'acl:default': placesContainerUri
        }),
        expect.objectContaining({
          'acl:agent': APP_URI,
          'acl:mode': 'acl:Append',
          'acl:default': placesContainerUri
        })
      ])
    });

    expect(placesRights['@graph']).not.toContain([
      expect.objectContaining({
        'acl:agent': APP_URI,
        'acl:mode': 'acl:Write',
        'acl:default': placesContainerUri
      })
    ]);

    expect(placesRights['@graph']).not.toContain([
      expect.objectContaining({
        'acl:agent': APP_URI,
        'acl:mode': 'acl:Control',
        'acl:default': placesContainerUri
      })
    ]);
  });

  test('Class descriptions are correctly created by the application', async () => {
    let app;

    await waitForExpect(async () => {
      app = await alice.call('ldp.remote.get', { resourceUri: APP_URI });

      expect(app?.['interop:hasAccessDescriptionSet']).toHaveLength(2);
    });

    const accessDescriptionSets = await Promise.all(
      app['interop:hasAccessDescriptionSet'].map(setUri =>
        alice.call('ldp.remote.get', {
          resourceUri: setUri
        })
      )
    );

    expect(accessDescriptionSets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'interop:AccessDescriptionSet',
          'interop:usesLanguage': 'en'
        }),
        expect.objectContaining({
          type: 'interop:AccessDescriptionSet',
          'interop:usesLanguage': 'fr'
        })
      ])
    );

    const classDescriptions = await Promise.all(
      accessDescriptionSets.map(set =>
        alice.call('ldp.remote.get', {
          resourceUri: set['apods:hasClassDescription']
        })
      )
    );

    expect(classDescriptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'apods:ClassDescription',
          'apods:describedClass': 'as:Event',
          'apods:describedBy': APP_URI,
          'skos:prefLabel': 'Events',
          'apods:labelPredicate': 'as:name',
          'apods:openEndpoint': 'https://example.app/r'
        }),
        expect.objectContaining({
          type: 'apods:ClassDescription',
          'apods:describedClass': 'as:Event',
          'apods:describedBy': APP_URI,
          'skos:prefLabel': 'Evénements',
          'apods:labelPredicate': 'as:name',
          'apods:openEndpoint': 'https://example.app/r'
        })
      ])
    );
  });

  test('Types are correctly registered in the TypeIndex', async () => {
    const typeIndex = await alice.call('type-indexes.get', {
      resourceUri: alice['solid:publicTypeIndex'],
      accept: MIME_TYPES.JSON
    });

    expect(typeIndex['solid:hasTypeRegistration']).toContainEqual(
      expect.objectContaining({
        'solid:forClass': 'as:Event',
        'solid:instanceContainer': urlJoin(alice.id, 'data/as/event'),
        'apods:defaultApp': APP_URI,
        'apods:availableApps': APP_URI,
        'skos:prefLabel': 'Events', // Alice speaks english (schema:knowsLanguage)
        'apods:labelPredicate': 'as:name',
        'apods:openEndpoint': 'https://example.app/r',
        'apods:icon': 'https://example.app/logo.png' // App icons
      })
    );
  });

  test('User installs same app a second time and get an error', async () => {
    await expect(
      alice.call('auth-agent.install', {
        appUri: APP_URI,
        acceptedAccessNeeds: requiredAccessNeedGroup['interop:hasAccessNeed'],
        acceptedSpecialRights: requiredAccessNeedGroup['apods:hasSpecialRights']
      })
    ).rejects.toThrow('User already has an application registration. Upgrade or uninstall the app first.');
  });

  test('User uninstalls app', async () => {
    await expect(alice.call('auth-agent.uninstall', { appUri: APP_URI })).resolves.not.toThrow();

    let appRegistrationUri;

    // The app backend is informed of the uninstallation
    await waitForExpect(async () => {
      const outbox = await alice.call('activitypub.collection.get', {
        resourceUri: alice.outbox,
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
          webId: 'system'
        })
      ).rejects.toThrow();
    });

    // A DataGrant should be deleted
    await waitForExpect(async () => {
      await expect(
        alice.call('ldp.resource.get', {
          resourceUri: requiredAccessGrant['interop:hasDataGrant'],
          accept: MIME_TYPES.JSON
        })
      ).rejects.toThrow();
    });

    // It should be deleted on the app server as well
    await waitForExpect(async () => {
      await expect(
        appServer.call('ldp.remote.getStored', {
          resourceUri: requiredAccessGrant['interop:hasDataGrant'],
          webId: 'system'
        })
      ).rejects.toThrow();
    });

    // TODO Test that the webhook channels are deleted
  });

  test('Permissions granted to the app should be removed', async () => {
    const eventsRights = await alice.call('webacl.resource.getRights', {
      resourceUri: urlJoin(alice.id, 'data/as/event'),
      accept: MIME_TYPES.JSON,
      webId: APP_URI
    });

    expect(eventsRights['@graph']).not.toContain([
      expect.objectContaining({
        'acl:agent': APP_URI,
        'acl:mode': 'acl:Read',
        'acl:accessTo': eventsContainerUri
      })
    ]);

    expect(eventsRights['@graph']).not.toContain([
      expect.objectContaining({
        'acl:agent': APP_URI,
        'acl:mode': 'acl:Write',
        'acl:accessTo': eventsContainerUri
      })
    ]);
  });

  test('App-related description should be removed from the TypeIndex', async () => {
    const typeIndex = await alice.call('type-indexes.get', {
      resourceUri: alice['solid:publicTypeIndex'],
      accept: MIME_TYPES.JSON
    });

    const eventTypeRegistration = typeIndex['solid:hasTypeRegistration'].find(r => r['solid:forClass'] === 'as:Event');

    expect(eventTypeRegistration['apods:defaultApp']).toBeUndefined();
    expect(eventTypeRegistration['apods:availableApps']).toBeUndefined();
    expect(eventTypeRegistration['apods:openEndpoint']).toBeUndefined();
    expect(eventTypeRegistration['apods:icon']).toBeUndefined();

    // We keep the label and labelPredicate for the data browser, even if no application handle this type of data
    expect(eventTypeRegistration['skos:prefLabel']).toBe('Events');
    expect(eventTypeRegistration['apods:labelPredicate']).toBe('as:name');
  });
});
