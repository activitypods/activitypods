import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { MIME_TYPES } from '@semapps/mime-types';
import { arrayOf, getId } from '@semapps/ldp';
import { connectPodProvider, clearAllData, initializeAppServer, createActor } from './initialize.ts';
import ExampleAppService from './apps/example.app.ts';
import { ACTIVITY_TYPES } from '@semapps/activitypub';
import CONFIG from './config.ts';
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
    locationsContainerUri,
    requiredAccessNeedGroup,
    optionalAccessNeedGroup,
    requiredAccessGrant,
    optionalAccessGrant,
    appRegistrationUri;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
    await appServer.start();

    appServer2 = await initializeAppServer(3002, 'app2Data', 'app2_settings', 2, ExampleAppService);
    await appServer2.start();

    alice = await createActor(podProvider, 'alice');
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
      'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
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
      'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/vcard/Location'),
      'interop:accessNecessity': 'interop:AccessOptional',
      'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Append'])
    });
  });

  test('User installs app and grants all access needs', async () => {
    appRegistrationUri = await alice.call('registration-endpoint.register', {
      appUri: APP_URI,
      acceptedAccessNeeds: [
        requiredAccessNeedGroup['interop:hasAccessNeed'],
        optionalAccessNeedGroup['interop:hasAccessNeed']
      ],
      acceptedSpecialRights: [
        requiredAccessNeedGroup['apods:hasSpecialRights'],
        optionalAccessNeedGroup['apods:hasSpecialRights']
      ]
    });

    // Ensure the app backend is informed of the installation
    await waitForExpect(async () => {
      const outboxMenu = await alice.call('activitypub.collection.get', {
        resourceUri: alice.outbox
      });

      const outbox = await alice.call('activitypub.collection.get', {
        resourceUri: alice.outbox,
        afterEq: new URL(outboxMenu?.first).searchParams.get('afterEq')
      });

      expect(outbox?.orderedItems[0]).toMatchObject({
        type: 'Create',
        object: expect.anything(),
        to: APP_URI
      });
    });
  });

  test('Application registration is correctly created', async () => {
    let appRegistration;

    // Get the app registration from the app server (it should be public like access grants)
    await waitForExpect(async () => {
      appRegistration = await appServer.call('ldp.remote.get', {
        resourceUri: appRegistrationUri,
        accept: MIME_TYPES.JSON,
        webId: APP_URI
      });

      expect(appRegistration).toMatchObject({
        type: 'interop:ApplicationRegistration',
        'interop:registeredAgent': APP_URI,
        'interop:registeredBy': alice.id,
        'interop:hasAccessGrant': expect.arrayContaining([])
      });

      expect(appRegistration['interop:hasAccessGrant']).toHaveLength(2);
    });

    const grants = await Promise.all(
      arrayOf(appRegistration['interop:hasAccessGrant']).map(accessGrantUri =>
        appServer.call('ldp.remote.get', {
          resourceUri: accessGrantUri,
          accept: MIME_TYPES.JSON,
          webId: APP_URI
        })
      )
    );

    requiredAccessGrant = grants.find(
      g => g['interop:satisfiesAccessNeed'] === requiredAccessNeedGroup['interop:hasAccessNeed']
    );
    optionalAccessGrant = grants.find(
      g => g['interop:satisfiesAccessNeed'] === optionalAccessNeedGroup['interop:hasAccessNeed']
    );

    expect(requiredAccessGrant).toMatchObject({
      type: 'interop:AccessGrant',
      'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
      'interop:hasDataRegistration': urlJoin(alice.id, 'data/as/event'),
      'interop:dataOwner': alice.id,
      'interop:grantedBy': alice.id,
      'interop:grantee': APP_URI,
      'interop:granteeType': 'interop:Application',
      'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Write', 'acl:Control']),
      'interop:satisfiesAccessNeed': requiredAccessNeedGroup['interop:hasAccessNeed'],
      'interop:scopeOfGrant': 'interop:AllFromRegistry'
    });

    expect(optionalAccessGrant).toMatchObject({
      type: 'interop:AccessGrant',
      'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/vcard/Location'),
      'interop:hasDataRegistration': urlJoin(alice.id, 'data/vcard/location'),
      'interop:dataOwner': alice.id,
      'interop:grantedBy': alice.id,
      'interop:grantee': APP_URI,
      'interop:granteeType': 'interop:Application',
      'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Append']),
      'interop:satisfiesAccessNeed': optionalAccessNeedGroup['interop:hasAccessNeed'],
      'interop:scopeOfGrant': 'interop:AllFromRegistry'
    });
  });

  test('Authorizations are correctly created', async () => {
    const authRegistry = await alice.call('auth-registry.get');

    const authorizations = await Promise.all(
      arrayOf(authRegistry['interop:hasAccessAuthorization']).map(async authorizationUri => {
        return await alice.call('access-authorizations.get', {
          resourceUri: authorizationUri
        });
      })
    );

    expect(authorizations).toContainEqual(
      expect.objectContaining({
        'interop:accessMode': expect.arrayContaining(['acl:Write', 'acl:Read', 'acl:Control']),
        'interop:hasDataRegistration': urlJoin(alice.id, 'data/as/event'),
        'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event')
      }),
      expect.objectContaining({
        'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Append']),
        'interop:hasDataRegistration': urlJoin(alice.id, 'data/vcard/location'),
        'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/vcard/Location')
      })
    );
  });

  test('Data registrations are created according to access needs', async () => {
    await expect(
      alice.call('ldp.container.exist', {
        containerUri: urlJoin(alice.id, 'data/as')
      })
    ).resolves.toBeTruthy();

    eventsContainerUri = urlJoin(alice.id, 'data/as/event');
    locationsContainerUri = urlJoin(alice.id, 'data/vcard/location');

    await expect(
      alice.call('ldp.container.get', {
        containerUri: eventsContainerUri,
        accept: MIME_TYPES.JSON
      })
    ).resolves.toMatchObject({
      type: expect.arrayContaining(['ldp:Container', 'ldp:BasicContainer', 'interop:DataRegistration']),
      'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event')
    });

    await expect(
      alice.call('ldp.container.get', {
        containerUri: locationsContainerUri,
        accept: MIME_TYPES.JSON
      })
    ).resolves.toMatchObject({
      type: expect.arrayContaining(['ldp:Container', 'ldp:BasicContainer', 'interop:DataRegistration']),
      'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/vcard/Location')
    });

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

    const locationsRights = await alice.call('webacl.resource.getRights', {
      resourceUri: urlJoin(alice.id, 'data/vcard/location'),
      accept: MIME_TYPES.JSON,
      webId: APP_URI
    });

    expect(locationsRights).toMatchObject({
      '@graph': expect.arrayContaining([
        expect.objectContaining({
          'acl:agent': APP_URI,
          'acl:mode': 'acl:Read',
          'acl:accessTo': locationsContainerUri
        })
      ])
    });

    expect(locationsRights['@graph']).not.toContain([
      expect.objectContaining({
        'acl:agent': APP_URI,
        'acl:mode': 'acl:Write',
        'acl:accessTo': locationsContainerUri
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

    const locationUri = await alice.call('ldp.container.post', {
      containerUri: urlJoin(alice.id, 'data/vcard/location'),
      resource: {
        type: 'vcard:Location',
        'vcard:given-name': 'Home sweet home'
      },
      contentType: MIME_TYPES.JSON
    });

    const locationsRights = await alice.call('webacl.resource.getRights', {
      resourceUri: locationUri,
      accept: MIME_TYPES.JSON,
      webId: 'system'
    });

    expect(locationsRights).toMatchObject({
      '@graph': expect.arrayContaining([
        expect.objectContaining({
          'acl:agent': APP_URI,
          'acl:mode': 'acl:Read',
          'acl:default': locationsContainerUri
        }),
        expect.objectContaining({
          'acl:agent': APP_URI,
          'acl:mode': 'acl:Append',
          'acl:default': locationsContainerUri
        })
      ])
    });

    expect(locationsRights['@graph']).not.toContain([
      expect.objectContaining({
        'acl:agent': APP_URI,
        'acl:mode': 'acl:Write',
        'acl:default': locationsContainerUri
      })
    ]);

    expect(locationsRights['@graph']).not.toContain([
      expect.objectContaining({
        'acl:agent': APP_URI,
        'acl:mode': 'acl:Control',
        'acl:default': locationsContainerUri
      })
    ]);
  });

  test('Types are correctly registered in the TypeIndex', async () => {
    const typeIndex = await alice.call('type-indexes.get', {
      resourceUri: alice['solid:publicTypeIndex'],
      accept: MIME_TYPES.JSON
    });

    expect(typeIndex['solid:hasTypeRegistration']).toContainEqual(
      expect.objectContaining({
        'solid:forClass': 'as:Event',
        'solid:instanceContainer': urlJoin(alice.id, 'data/as/event')
      }),
      expect.objectContaining({
        'solid:forClass': 'vcard:Location',
        'solid:instanceContainer': urlJoin(alice.id, 'data/vcard/location')
      })
    );
  });

  test('User installs same app a second time and get an error', async () => {
    await expect(
      alice.call('registration-endpoint.register', {
        appUri: APP_URI,
        acceptedAccessNeeds: requiredAccessNeedGroup['interop:hasAccessNeed'],
        acceptedSpecialRights: requiredAccessNeedGroup['apods:hasSpecialRights']
      })
    ).rejects.toThrow('User already has an application registration. Upgrade or remove the app first.');
  });

  test('User uninstalls app', async () => {
    await alice.call('registration-endpoint.remove', { appUri: APP_URI });

    let appRegistrationUri;

    // The app backend is informed of the uninstallation
    await waitForExpect(async () => {
      const outboxMenu = await alice.call('activitypub.collection.get', {
        resourceUri: alice.outbox
      });

      const outbox = await alice.call('activitypub.collection.get', {
        resourceUri: alice.outbox,
        afterEq: new URL(outboxMenu?.first).searchParams.get('afterEq')
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

    // An access grant should be deleted
    await waitForExpect(async () => {
      await expect(
        alice.call('ldp.resource.get', {
          resourceUri: getId(requiredAccessGrant),
          accept: MIME_TYPES.JSON
        })
      ).rejects.toThrow();
    });

    // It should be deleted on the app server as well
    await waitForExpect(async () => {
      await expect(
        appServer.call('ldp.remote.getStored', {
          resourceUri: getId(requiredAccessGrant),
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

  test('Types are still registered in the TypeIndex', async () => {
    const typeIndex = await alice.call('type-indexes.get', {
      resourceUri: alice['solid:publicTypeIndex'],
      accept: MIME_TYPES.JSON
    });

    expect(typeIndex['solid:hasTypeRegistration']).toContainEqual(
      expect.objectContaining({
        'solid:forClass': 'as:Event',
        'solid:instanceContainer': urlJoin(alice.id, 'data/as/event')
      }),
      expect.objectContaining({
        'solid:forClass': 'vcard:Location',
        'solid:instanceContainer': urlJoin(alice.id, 'data/vcard/location')
      })
    );
  });
});
