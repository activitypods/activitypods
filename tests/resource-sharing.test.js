const urlJoin = require('url-join');
const waitForExpect = require('wait-for-expect');
const { OBJECT_TYPES } = require('@semapps/activitypub');
const { MIME_TYPES } = require('@semapps/mime-types');
const { connectPodProvider, clearAllData, initializeAppServer, installApp } = require('./initialize');
const ExampleAppService = require('./apps/example3.app');
const CONFIG = require('./config');

jest.setTimeout(120000);

const NUM_PODS = 3;
const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');

describe('Test resource sharing features', () => {
  let actors = [],
    podProvider,
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

    for (let i = 1; i <= NUM_PODS; i++) {
      const actorData = require(`./data/actor${i}.json`);
      const { webId } = await podProvider.call('auth.signup', actorData);
      actors[i] = await podProvider.call(
        'activitypub.actor.awaitCreateComplete',
        {
          actorUri: webId,
          additionalKeys: ['url', 'apods:contacts', 'apods:contactRequests', 'apods:rejectedContacts']
        },
        { meta: { dataset: actorData.username } }
      );
      actors[i].call = (actionName, params, options = {}) =>
        podProvider.call(actionName, params, {
          ...options,
          meta: { ...options.meta, webId, dataset: actors[i].preferredUsername }
        });
    }

    alice = actors[1];
    bob = actors[2];
    craig = actors[3];

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
    await alice.call('social-agent-registrations.addAuthorization', {
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

  test('A data authorization is created in Alice storage', async () => {
    await waitForExpect(async () => {
      const dataAuthorizations = await alice.call('data-authorizations.listForSingleResource', {
        resourceUri: eventUri
      });

      expect(dataAuthorizations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:DataAuthorization',
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

  test('A data grant for the event is declared in Bob registration', async () => {
    const accessGrant = await alice.call('access-grants.get', {
      resourceUri: aliceRegistrationForBob['interop:hasAccessGrant']
    });

    const dataGrant = await alice.call('data-grants.get', {
      resourceUri: accessGrant['interop:hasDataGrant']
    });

    expect(dataGrant).toMatchObject({
      type: 'interop:DataGrant',
      'interop:dataOwner': alice.id,
      'interop:grantee': bob.id,
      'interop:hasDataInstance': eventUri,
      'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
      'interop:scopeOfGrant': 'interop:SelectedFromRegistry'
    });
  });

  test('A delegated data grant is created by Bob AA for the application', async () => {
    await waitForExpect(async () => {
      bobAppRegistration = await bob.call('app-registrations.get', {
        resourceUri: bobAppRegistrationUri
      });

      const dataGrants = await bob.call('app-registrations.getDataGrants', {
        agentRegistration: bobAppRegistration,
        podOwner: bob.id
      });

      expect(dataGrants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:DelegatedDataGrant',
            'interop:accessMode': 'acl:Read',
            'interop:dataOwner': alice.id,
            'interop:grantee': APP_URI,
            'interop:hasDataInstance': eventUri,
            'interop:hasDataRegistration': eventContainerUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfGrant': 'interop:SelectedFromRegistry'
          })
        ])
      );
    });
  });

  test('Craig installs the app after Alice shared her event and a delegated data grant is created', async () => {
    await alice.call('social-agent-registrations.addAuthorization', {
      resourceUri: eventUri,
      grantee: craig.id,
      accessModes: ['acl:Read']
    });

    const craigAppRegistrationUri = await installApp(craig, APP_URI);

    await waitForExpect(async () => {
      const craigAppRegistration = await craig.call('app-registrations.get', {
        resourceUri: craigAppRegistrationUri
      });

      const dataGrants = await craig.call('app-registrations.getDataGrants', {
        agentRegistration: craigAppRegistration,
        podOwner: craig.id
      });

      expect(dataGrants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:DelegatedDataGrant',
            'interop:accessMode': 'acl:Read',
            'interop:dataOwner': alice.id,
            'interop:grantee': APP_URI,
            'interop:hasDataInstance': eventUri,
            'interop:hasDataRegistration': eventContainerUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfGrant': 'interop:SelectedFromRegistry'
          })
        ])
      );
    });
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

    await alice.call('social-agent-registrations.addAuthorization', {
      resourceUri: event2Uri,
      grantee: bob.id,
      accessModes: ['acl:Read']
    });

    // Alice data authorization is regenerated
    await waitForExpect(async () => {
      const dataAuthorizations = await alice.call('data-authorizations.listForSingleResource', {
        resourceUri: eventUri
      });

      expect(dataAuthorizations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:DataAuthorization',
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
        alice.call('social-agent-registrations.getDataGrants', {
          agentRegistration: updatedRegistration,
          podOwner: alice.id
        })
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:DataGrant',
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
        bob.call('app-registrations.getDataGrants', {
          agentRegistration: updatedRegistration,
          podOwner: bob.id
        })
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'interop:DelegatedDataGrant',
            'interop:accessMode': 'acl:Read',
            'interop:dataOwner': alice.id,
            'interop:grantee': APP_URI,
            'interop:hasDataInstance': expect.arrayContaining([eventUri, event2Uri]),
            'interop:hasDataRegistration': eventContainerUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfGrant': 'interop:SelectedFromRegistry'
          })
        ])
      );
    });
  });

  test('Alice un-share her event with Craig', async () => {
    await alice.call('social-agent-registrations.removeAuthorization', {
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
  });
});
