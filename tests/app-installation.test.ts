import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { ServiceBroker } from 'moleculer';
import { MIME_TYPES } from '@semapps/mime-types';
import { arrayOf, getId } from '@semapps/ldp';
import { connectPodProvider, clearAllData, initializeAppServer, createTestActor, getTestApp } from './initialize.ts';
import ExampleAppService from './apps/example.app.ts';
import { ACTIVITY_TYPES } from '@semapps/activitypub';
import * as CONFIG from './config.ts';
import { TestActor, TestApp } from './utilTypes.js';

jest.setTimeout(80000);

describe('Test app installation', () => {
  let podProvider: ServiceBroker,
    appServer: ServiceBroker,
    alice: TestActor,
    app: TestApp,
    eventsContainerUri: string,
    locationsContainerUri: string,
    requiredAccessNeedGroup: any,
    optionalAccessNeedGroup: any,
    requiredAccessGrant: any,
    optionalAccessGrant: any,
    appRegistrationUri: string;

  beforeAll(async () => {
    await clearAllData();

    podProvider = await connectPodProvider();
    alice = await createTestActor(podProvider, 'alice');

    appServer = await initializeAppServer(3001, 'app', 'app_settings', 1, ExampleAppService);
    await appServer.start();
  }, 80000);

  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
  });

  test('App access needs are correctly declared', async () => {
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      app = await getTestApp(appServer);

      expect(app).toMatchObject({
        type: expect.arrayContaining(['interop:Application']),
        'interop:applicationName': 'Example App',
        'interop:applicationDescription': 'An ActivityPods app for integration tests',
        'interop:hasAccessNeedGroup': expect.anything()
      });

      expect(arrayOf(app['interop:hasAccessNeedGroup'])).toHaveLength(2);
    });

    for (const accessNeedUri of arrayOf(app['interop:hasAccessNeedGroup'])) {
      const accessNeedGroup = await app.call('ldp.resource.get', { resourceUri: accessNeedUri });
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
      app.call('ldp.resource.get', { resourceUri: requiredAccessNeedGroup['interop:hasAccessNeed'] })
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
      app.call('ldp.resource.get', {
        resourceUri: optionalAccessNeedGroup['interop:hasAccessNeed']
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
      appUri: app.id,
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
    // @ts-expect-error This expression is not callable
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
        to: app.id
      });
    });
  });

  test('Application registration is correctly created', async () => {
    let appRegistration: any;

    // Get the app registration from the app server (it should be public like access grants)
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      appRegistration = await app.call('ldp.remote.get', { resourceUri: appRegistrationUri });

      expect(appRegistration).toMatchObject({
        type: 'interop:ApplicationRegistration',
        'interop:registeredAgent': app.id,
        'interop:registeredBy': alice.id,
        'interop:hasAccessGrant': expect.arrayContaining([])
      });

      expect(appRegistration['interop:hasAccessGrant']).toHaveLength(2);
    });

    const grants = await Promise.all(
      arrayOf(appRegistration['interop:hasAccessGrant']).map((accessGrantUri: any) =>
        app.call('ldp.remote.get', { resourceUri: accessGrantUri })
      )
    );

    requiredAccessGrant = grants.find(
      (g: any) => g['interop:satisfiesAccessNeed'] === requiredAccessNeedGroup['interop:hasAccessNeed']
    );
    optionalAccessGrant = grants.find(
      (g: any) => g['interop:satisfiesAccessNeed'] === optionalAccessNeedGroup['interop:hasAccessNeed']
    );

    expect(requiredAccessGrant).toMatchObject({
      type: 'interop:AccessGrant',
      'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
      'interop:hasDataRegistration': expect.anything(),
      'interop:dataOwner': alice.id,
      'interop:grantedBy': alice.id,
      'interop:grantee': app.id,
      'interop:granteeType': 'interop:Application',
      'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Write', 'acl:Control']),
      'interop:satisfiesAccessNeed': requiredAccessNeedGroup['interop:hasAccessNeed'],
      'interop:scopeOfGrant': 'interop:AllFromRegistry'
    });

    expect(optionalAccessGrant).toMatchObject({
      type: 'interop:AccessGrant',
      'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/vcard/Location'),
      'interop:hasDataRegistration': expect.anything(),
      'interop:dataOwner': alice.id,
      'interop:grantedBy': alice.id,
      'interop:grantee': app.id,
      'interop:granteeType': 'interop:Application',
      'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Append']),
      'interop:satisfiesAccessNeed': optionalAccessNeedGroup['interop:hasAccessNeed'],
      'interop:scopeOfGrant': 'interop:AllFromRegistry'
    });

    eventsContainerUri = requiredAccessGrant['interop:hasDataRegistration'];
    locationsContainerUri = optionalAccessGrant['interop:hasDataRegistration'];
  });

  test('Authorizations are correctly created', async () => {
    const authRegistry = await alice.call('auth-registry.get');

    const authorizations = await Promise.all(
      arrayOf(authRegistry['interop:hasAccessAuthorization']).map(async (authorizationUri: any) => {
        return await alice.call('access-authorizations.get', {
          resourceUri: authorizationUri
        });
      })
    );

    expect(authorizations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          'interop:accessMode': expect.arrayContaining(['acl:Write', 'acl:Read', 'acl:Control']),
          'interop:hasDataRegistration': eventsContainerUri,
          'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event')
        }),
        expect.objectContaining({
          'interop:accessMode': expect.arrayContaining(['acl:Read', 'acl:Append']),
          'interop:hasDataRegistration': locationsContainerUri,
          'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/vcard/Location')
        })
      ])
    );
  });

  test('Data registrations are created according to access needs', async () => {
    await expect(alice.call('ldp.container.get', { containerUri: eventsContainerUri })).resolves.toMatchObject({
      type: expect.arrayContaining(['ldp:Container', 'ldp:BasicContainer', 'interop:DataRegistration']),
      'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event')
    });

    await expect(alice.call('ldp.container.get', { containerUri: locationsContainerUri })).resolves.toMatchObject({
      type: expect.arrayContaining(['ldp:Container', 'ldp:BasicContainer', 'interop:DataRegistration']),
      'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/vcard/Location')
    });
  });

  test('Types are correctly registered in the TypeIndex', async () => {
    const publicTypeIndex = await alice.call('public-type-index.get');

    expect(publicTypeIndex['@graph']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          'solid:forClass': 'as:Event',
          'solid:instanceContainer': eventsContainerUri
        }),
        expect.objectContaining({
          'solid:forClass': 'vcard:Location',
          'solid:instanceContainer': locationsContainerUri
        })
      ])
    );
  });

  test('User installs same app a second time and get an error', async () => {
    await expect(
      alice.call('registration-endpoint.register', {
        appUri: app.id,
        acceptedAccessNeeds: requiredAccessNeedGroup['interop:hasAccessNeed'],
        acceptedSpecialRights: requiredAccessNeedGroup['apods:hasSpecialRights']
      })
    ).rejects.toThrow('User already has an application registration. Upgrade or remove the app first.');
  });

  test('User uninstalls app', async () => {
    await alice.call('registration-endpoint.remove', { appUri: app.id });

    let appRegistrationUri: any;

    // The app backend is informed of the uninstallation
    // @ts-expect-error This expression is not callable
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
        to: app.id
      });

      appRegistrationUri = outbox?.orderedItems[0]?.object;
    });

    // The ApplicationRegistration should be deleted
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(alice.call('ldp.resource.get', { resourceUri: appRegistrationUri })).rejects.toThrow();
    });

    // It should be deleted on the app server as well
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        app.call('ldp.remote.getStored', {
          resourceUri: appRegistrationUri,
          webId: 'system'
        })
      ).rejects.toThrow();
    });

    // An access grant should be deleted
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(alice.call('ldp.resource.get', { resourceUri: getId(requiredAccessGrant) })).rejects.toThrow();
    });

    // It should be deleted on the app server as well
    // @ts-expect-error This expression is not callable
    await waitForExpect(async () => {
      await expect(
        app.call('ldp.remote.getStored', {
          resourceUri: getId(requiredAccessGrant),
          webId: 'system'
        })
      ).rejects.toThrow();
    });

    // TODO Test that the webhook channels are deleted
  });

  test('Permissions granted to the app should be removed', async () => {
    const eventsRights = await alice.call('webacl.resource.getRights', {
      resourceUri: eventsContainerUri,
      accept: MIME_TYPES.JSON,
      webId: app.id
    });

    expect(eventsRights['@graph']).not.toContain([
      expect.objectContaining({
        'acl:agent': app.id,
        'acl:mode': 'acl:Read',
        'acl:accessTo': eventsContainerUri
      })
    ]);

    expect(eventsRights['@graph']).not.toContain([
      expect.objectContaining({
        'acl:agent': app.id,
        'acl:mode': 'acl:Write',
        'acl:accessTo': eventsContainerUri
      })
    ]);
  });

  test('Types are still registered in the TypeIndex', async () => {
    const publicTypeIndex = await alice.call('public-type-index.get');

    expect(publicTypeIndex['@graph']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          'solid:forClass': 'as:Event',
          'solid:instanceContainer': eventsContainerUri
        }),
        expect.objectContaining({
          'solid:forClass': 'vcard:Location',
          'solid:instanceContainer': locationsContainerUri
        })
      ])
    );
  });
});
