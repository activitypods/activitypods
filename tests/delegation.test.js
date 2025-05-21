const urlJoin = require('url-join');
const waitForExpect = require('wait-for-expect');
const { OBJECT_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const { connectPodProvider, clearAllData, createActor, initializeAppServer, installApp } = require('./initialize');
const ExampleAppService = require('./apps/example3.app');
const CONFIG = require('./config');

jest.setTimeout(120000);

const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');

describe('Test delegation features', () => {
  let podProvider, appServer, alice, bob, craig, eventContainerUri, eventUri, craigAppRegistrationUri;

  beforeAll(async () => {
    clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
    await appServer.start();

    alice = await createActor(podProvider, 'alice');
    bob = await createActor(podProvider, 'bob');
    craig = await createActor(podProvider, 'craig');

    // We only need to install the app for Craig
    craigAppRegistrationUri = await installApp(craig, APP_URI);
  });

  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
  });

  test('Alice creates an event and gives delegation right to Bob', async () => {
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

    await alice.call('social-agent-registrations.addAuthorization', {
      resourceUri: eventUri,
      grantee: bob.id,
      accessModes: ['acl:Read'],
      delegationAllowed: true,
      delegationLimit: 1
    });

    // An authorization is created with the delegation information
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
            'interop:grantedBy': alice.id,
            'interop:hasDataInstance': eventUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfAuthorization': 'interop:SelectedFromRegistry'
          })
        ])
      );
    });

    // A grant is created with the delegation information
    await waitForExpect(async () => {
      const bobRegistration = await alice.call('social-agent-registrations.getForAgent', {
        agentUri: bob.id,
        podOwner: alice.id
      });

      await expect(
        alice.call('social-agent-registrations.getGrants', {
          agentRegistration: bobRegistration,
          podOwner: alice.id
        })
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:AccessGrant',
            'interop:dataOwner': alice.id,
            'interop:grantee': bob.id,
            'interop:grantedBy': alice.id,
            'interop:hasDataInstance': eventUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfGrant': 'interop:SelectedFromRegistry',
            'interop:delegationAllowed': true,
            'interop:delegationLimit': 1
          })
        ])
      );
    });

    // The grant is stored in Bob storage
    await waitForExpect(async () => {
      await expect(
        bob.call('access-grants.getByResourceUri', {
          resourceUri: eventUri
        })
      ).resolves.toMatchObject({
        type: 'interop:AccessGrant',
        'interop:dataOwner': alice.id,
        'interop:grantee': bob.id,
        'interop:grantedBy': alice.id,
        'interop:hasDataInstance': eventUri,
        'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
        'interop:scopeOfGrant': 'interop:SelectedFromRegistry',
        'interop:delegationAllowed': true,
        'interop:delegationLimit': 1
      });
    });
  });

  test('Bob shares Alice event with Craig', async () => {
    await bob.call('social-agent-registrations.addAuthorization', {
      resourceUri: eventUri,
      grantee: craig.id,
      accessModes: ['acl:Read']
    });

    // An authorization is created with the delegation information
    await waitForExpect(async () => {
      const authorizations = await bob.call('access-authorizations.listForSingleResource', {
        resourceUri: eventUri
      });

      expect(authorizations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:AccessAuthorization',
            'interop:dataOwner': alice.id,
            'interop:grantee': craig.id,
            'interop:hasDataInstance': eventUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfAuthorization': 'interop:SelectedFromRegistry'
          })
        ])
      );
    });

    // A delegated grant is created by Alice and shared with Craig
    await waitForExpect(async () => {
      const craigRegistration = await bob.call('social-agent-registrations.getForAgent', {
        agentUri: craig.id,
        podOwner: bob.id
      });

      await expect(
        bob.call('social-agent-registrations.getGrants', {
          agentRegistration: craigRegistration,
          podOwner: bob.id
        })
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:DelegatedAccessGrant',
            'interop:dataOwner': alice.id,
            'interop:grantedBy': bob.id,
            'interop:grantee': craig.id,
            'interop:hasDataInstance': eventUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfGrant': 'interop:SelectedFromRegistry'
          })
        ])
      );
    });

    // A delegated grant is created by Craig for the application
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
});
