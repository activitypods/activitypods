const urlJoin = require('url-join');
const waitForExpect = require('wait-for-expect');
const { OBJECT_TYPES } = require('@semapps/activitypub');
const { arrayOf } = require('@semapps/ldp');
const { MIME_TYPES } = require('@semapps/mime-types');
const { connectPodProvider, clearAllData, createActor, initializeAppServer, installApp } = require('./initialize');
const ExampleAppService = require('./apps/example3.app');
const CONFIG = require('./config');

jest.setTimeout(120000);

const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');

describe('Test resource sharing features', () => {
  let podProvider,
    appServer,
    alice,
    bob,
    craig,
    eventContainerUri,
    eventUri,
    event2Uri,
    bobAppRegistration,
    bobAppRegistrationUri,
    aliceRegistrationForBob;

  beforeAll(async () => {
    clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
    await appServer.start();

    alice = await createActor(podProvider, 'alice');
    bob = await createActor(podProvider, 'bob');
    craig = await createActor(podProvider, 'craig');

    bobAppRegistrationUri = await installApp(bob, APP_URI);
  });

  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
  });

  test('Alice creates an event', async () => {
    // Create container manually so that we don't need to install the app
    eventContainerUri = await alice.call('data-registrations.generateFromShapeTree', {
      shapeTreeUri: urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
      podOwner: alice.id
    });

    eventUri = await alice.call('ldp.container.post', {
      containerUri: eventContainerUri,
      resource: {
        type: OBJECT_TYPES.EVENT,
        name: 'Birthday party !!'
      },
      contentType: MIME_TYPES.JSON
    });
  });

  test('Alice share her event with Bob and social agent registrations are created', async () => {
    await alice.call('access-authorizations.addForSingleResource', {
      resourceUri: eventUri,
      grantee: bob.id,
      accessModes: ['acl:Read']
    });

    // Alice created a social agent registration for Bob
    await waitForExpect(async () => {
      aliceRegistrationForBob = await alice.call('social-agent-registrations.getForAgent', {
        agentUri: bob.id,
        podOwner: alice.id
      });
      expect(aliceRegistrationForBob).toMatchObject({
        'interop:registeredAgent': bob.id,
        'interop:registeredBy': alice.id
      });
    });

    // Bob created a reciprocal registration for Alice
    await waitForExpect(async () => {
      const bobRegistrationForAlice = await bob.call('social-agent-registrations.getForAgent', {
        agentUri: alice.id,
        podOwner: bob.id
      });
      expect(bobRegistrationForAlice).toMatchObject({
        'interop:registeredAgent': alice.id,
        'interop:registeredBy': bob.id
      });
    });
  });

  test('An authorization is created in Alice storage', async () => {
    await waitForExpect(async () => {
      const authorizations = await alice.call('access-authorizations.listForSingleResource', {
        resourceUri: eventUri
      });

      expect(authorizations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:AccessAuthorization',
            'interop:dataOwner': alice.id,
            'interop:grantee': bob.id,
            'interop:hasDataInstance': eventUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfAuthorization': 'interop:SelectedFromRegistry'
          })
        ])
      );
    });
  });

  test('A grant for the event is declared in Bob registration', async () => {
    const grant = await alice.call('access-grants.get', {
      resourceUri: aliceRegistrationForBob['interop:hasAccessGrant']
    });

    expect(grant).toMatchObject({
      type: 'interop:AccessGrant',
      'interop:dataOwner': alice.id,
      'interop:grantee': bob.id,
      'interop:hasDataInstance': eventUri,
      'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
      'interop:scopeOfGrant': 'interop:SelectedFromRegistry'
    });

    // Bob can fetch Alice event
    await expect(
      bob.call('ldp.resource.get', {
        resourceUri: eventUri,
        accept: MIME_TYPES.JSON
      })
    ).resolves.not.toThrow();
  });

  test('A delegated grant is created by Bob AA for the application', async () => {
    await waitForExpect(async () => {
      bobAppRegistration = await bob.call('app-registrations.get', {
        resourceUri: bobAppRegistrationUri
      });

      const grants = await bob.call('app-registrations.getGrants', {
        agentRegistration: bobAppRegistration,
        podOwner: bob.id
      });

      expect(grants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:DelegatedAccessGrant',
            'interop:accessMode': 'acl:Read',
            'interop:dataOwner': alice.id,
            'interop:grantee': APP_URI,
            'interop:grantedBy': bob.id,
            'interop:hasDataInstance': eventUri,
            'interop:hasDataRegistration': eventContainerUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfGrant': 'interop:SelectedFromRegistry'
          })
        ])
      );
    });
  });

  test('Craig installs the app after Alice shared her event and a delegated grant is created', async () => {
    await alice.call('access-authorizations.addForSingleResource', {
      resourceUri: eventUri,
      grantee: craig.id,
      accessModes: ['acl:Read']
    });

    const craigAppRegistrationUri = await installApp(craig, APP_URI);

    await waitForExpect(async () => {
      const craigAppRegistration = await craig.call('app-registrations.get', {
        resourceUri: craigAppRegistrationUri
      });

      const grants = await craig.call('app-registrations.getGrants', {
        agentRegistration: craigAppRegistration,
        podOwner: craig.id
      });

      expect(grants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:DelegatedAccessGrant',
            'interop:accessMode': 'acl:Read',
            'interop:dataOwner': alice.id,
            'interop:grantee': APP_URI,
            'interop:grantedBy': craig.id,
            'interop:hasDataInstance': eventUri,
            'interop:hasDataRegistration': eventContainerUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfGrant': 'interop:SelectedFromRegistry'
          })
        ])
      );
    });

    // Craig can fetch Alice event
    await expect(
      craig.call('ldp.resource.get', {
        resourceUri: eventUri,
        accept: MIME_TYPES.JSON
      })
    ).resolves.not.toThrow();
  });

  test('Alice shares another event with Bob', async () => {
    event2Uri = await alice.call('ldp.container.post', {
      containerUri: eventContainerUri,
      resource: {
        type: OBJECT_TYPES.EVENT,
        name: 'Barbecue in my garden'
      },
      contentType: MIME_TYPES.JSON
    });

    await alice.call('access-authorizations.addForSingleResource', {
      resourceUri: event2Uri,
      grantee: bob.id,
      accessModes: ['acl:Read']
    });

    // Alice authorization is regenerated
    await waitForExpect(async () => {
      const authorizations = await alice.call('access-authorizations.listForSingleResource', {
        resourceUri: eventUri
      });

      expect(authorizations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:AccessAuthorization',
            'interop:dataOwner': alice.id,
            'interop:grantee': bob.id,
            'interop:hasDataInstance': expect.arrayContaining([eventUri, event2Uri]),
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfAuthorization': 'interop:SelectedFromRegistry',
            'interop:replaces': expect.anything()
          })
        ])
      );
    });

    // Alice registration for Bob is updated
    await waitForExpect(async () => {
      const updatedRegistration = await alice.call('social-agent-registrations.getForAgent', {
        agentUri: bob.id,
        podOwner: alice.id
      });

      await expect(
        alice.call('social-agent-registrations.getGrants', {
          agentRegistration: updatedRegistration,
          podOwner: alice.id
        })
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:AccessGrant',
            'interop:dataOwner': alice.id,
            'interop:grantee': bob.id,
            'interop:hasDataInstance': expect.arrayContaining([eventUri, event2Uri]),
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfGrant': 'interop:SelectedFromRegistry',
            'interop:replaces': expect.anything()
          })
        ])
      );
    });

    // Bob registration for Example App is updated
    await waitForExpect(async () => {
      const updatedRegistration = await bob.call('app-registrations.getForAgent', {
        agentUri: APP_URI,
        podOwner: bob.id
      });

      await expect(
        bob.call('app-registrations.getGrants', {
          agentRegistration: updatedRegistration,
          podOwner: bob.id
        })
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:DelegatedAccessGrant',
            'interop:accessMode': 'acl:Read',
            'interop:dataOwner': alice.id,
            'interop:grantee': APP_URI,
            'interop:grantedBy': bob.id,
            'interop:hasDataInstance': expect.arrayContaining([eventUri, event2Uri]),
            'interop:hasDataRegistration': eventContainerUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfGrant': 'interop:SelectedFromRegistry'
          })
        ])
      );
    });

    // Bob can fetch Alice new event
    await expect(
      bob.call('ldp.resource.get', {
        resourceUri: event2Uri,
        accept: MIME_TYPES.JSON
      })
    ).resolves.not.toThrow();
  });

  test('Alice un-share her event with Craig', async () => {
    await alice.call('access-authorizations.removeForSingleResource', {
      resourceUri: eventUri,
      grantee: craig.id
    });

    // Alice registration for Craig doesn't contain any access grant
    await waitForExpect(async () => {
      const craigRegistration = await alice.call('social-agent-registrations.getForAgent', {
        agentUri: craig.id,
        podOwner: alice.id
      });
      expect(craigRegistration['interop:hasAccessGrant']).toBeUndefined();
    });

    // Delegated grants has been removed from app registration
    await waitForExpect(async () => {
      const updatedRegistration = await craig.call('app-registrations.getForAgent', {
        agentUri: APP_URI,
        podOwner: craig.id
      });

      expect(arrayOf(updatedRegistration['interop:hasAccessGrant'])).toHaveLength(1);
    });

    // Craig cannot fetch Alice event anymore
    await waitForExpect(async () => {
      await expect(
        craig.call('ldp.resource.get', {
          resourceUri: eventUri,
          accept: MIME_TYPES.JSON
        })
      ).rejects.toThrow();
    });
  });

  test('Bob remove the app and all delegated grants are deleted', async () => {
    await bob.call('registration-endpoint.remove', {
      appUri: APP_URI
    });

    await waitForExpect(async () => {
      const delegatedGrants = await bob.call('delegated-access-grants.list');

      console.log('delegatedGrants', delegatedGrants);

      expect(arrayOf(delegatedGrants['ldp:contains'])).toHaveLength(0);
    });
  });
});
