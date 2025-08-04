// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
// @ts-expect-error TS(2305): Module '"@semapps/activitypub"' has no exported me... Remove this comment to see the full error message
import { OBJECT_TYPES } from '@semapps/activitypub';
// @ts-expect-error TS(2305): Module '"@semapps/ldp"' has no exported member 'ar... Remove this comment to see the full error message
import { arrayOf } from '@semapps/ldp';
import { MIME_TYPES } from '@semapps/mime-types';

// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import { connectPodProvider, clearAllData, createActor, initializeAppServer, installApp } from './initialize.ts';

// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import ExampleAppService from './apps/example3.app.ts';
// @ts-expect-error TS(2691): An import path cannot end with a '.ts' extension. ... Remove this comment to see the full error message
import CONFIG from './config.ts';
// @ts-expect-error TS(2304): Cannot find name 'jest'.
jest.setTimeout(120000);
const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');

// @ts-expect-error TS(2582): Cannot find name 'describe'. Do you need to instal... Remove this comment to see the full error message
describe('Test resource sharing features', () => {
  let podProvider: any,
    appServer: any,
    alice: any,
    bob: any,
    craig: any,
    eventContainerUri: any,
    eventUri: any,
    event2Uri: any,
    bobAppRegistration,
    bobAppRegistrationUri: any,
    aliceRegistrationForBob: any;

  // @ts-expect-error TS(2304): Cannot find name 'beforeAll'.
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

  // @ts-expect-error TS(2304): Cannot find name 'afterAll'.
  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
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
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(bobRegistrationForAlice).toMatchObject({
        'interop:registeredAgent': alice.id,
        'interop:registeredBy': bob.id
      });
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('An authorization is created in Alice storage', async () => {
    await waitForExpect(async () => {
      const authorizations = await alice.call('access-authorizations.listForSingleResource', {
        resourceUri: eventUri
      });

      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(authorizations).toEqual(
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        expect.arrayContaining([
          // @ts-expect-error TS(2304): Cannot find name 'expect'.
          expect.objectContaining({
            type: 'interop:AccessAuthorization',
            'interop:dataOwner': alice.id,
            'interop:grantee': bob.id,
            'interop:granteeType': 'interop:SocialAgent',
            'interop:hasDataInstance': eventUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfAuthorization': 'interop:SelectedFromRegistry'
          })
        ])
      );
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('A grant for the event is declared in Bob registration', async () => {
    const grant = await alice.call('access-grants.get', {
      resourceUri: aliceRegistrationForBob['interop:hasAccessGrant']
    });

    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    expect(grant).toMatchObject({
      type: 'interop:AccessGrant',
      'interop:dataOwner': alice.id,
      'interop:grantee': bob.id,
      'interop:granteeType': 'interop:SocialAgent',
      'interop:hasDataInstance': eventUri,
      'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
      'interop:scopeOfGrant': 'interop:SelectedFromRegistry'
    });

    // Bob can fetch Alice event
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      bob.call('ldp.resource.get', {
        resourceUri: eventUri,
        accept: MIME_TYPES.JSON
      })
    ).resolves.not.toThrow();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('A delegated grant is created by Bob AA for the application', async () => {
    await waitForExpect(async () => {
      bobAppRegistration = await bob.call('app-registrations.get', {
        resourceUri: bobAppRegistrationUri
      });

      const grants = await bob.call('app-registrations.getGrants', {
        agentRegistration: bobAppRegistration,
        podOwner: bob.id
      });

      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(grants).toEqual(
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        expect.arrayContaining([
          // @ts-expect-error TS(2304): Cannot find name 'expect'.
          expect.objectContaining({
            type: 'interop:DelegatedAccessGrant',
            'interop:accessMode': 'acl:Read',
            'interop:dataOwner': alice.id,
            'interop:grantee': APP_URI,
            'interop:granteeType': 'interop:Application',
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

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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

      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(grants).toEqual(
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        expect.arrayContaining([
          // @ts-expect-error TS(2304): Cannot find name 'expect'.
          expect.objectContaining({
            type: 'interop:DelegatedAccessGrant',
            'interop:accessMode': 'acl:Read',
            'interop:dataOwner': alice.id,
            'interop:grantee': APP_URI,
            'interop:granteeType': 'interop:Application',
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
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      craig.call('ldp.resource.get', {
        resourceUri: eventUri,
        accept: MIME_TYPES.JSON
      })
    ).resolves.not.toThrow();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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

      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(authorizations).toEqual(
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        expect.arrayContaining([
          // @ts-expect-error TS(2304): Cannot find name 'expect'.
          expect.objectContaining({
            type: 'interop:AccessAuthorization',
            'interop:dataOwner': alice.id,
            'interop:grantee': bob.id,
            'interop:granteeType': 'interop:SocialAgent',
            // @ts-expect-error TS(2304): Cannot find name 'expect'.
            'interop:hasDataInstance': expect.arrayContaining([eventUri, event2Uri]),
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfAuthorization': 'interop:SelectedFromRegistry',
            // @ts-expect-error TS(2304): Cannot find name 'expect'.
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

      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        alice.call('social-agent-registrations.getGrants', {
          agentRegistration: updatedRegistration,
          podOwner: alice.id
        })
      ).resolves.toEqual(
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        expect.arrayContaining([
          // @ts-expect-error TS(2304): Cannot find name 'expect'.
          expect.objectContaining({
            type: 'interop:AccessGrant',
            'interop:dataOwner': alice.id,
            'interop:grantee': bob.id,
            'interop:granteeType': 'interop:SocialAgent',
            // @ts-expect-error TS(2304): Cannot find name 'expect'.
            'interop:hasDataInstance': expect.arrayContaining([eventUri, event2Uri]),
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfGrant': 'interop:SelectedFromRegistry',
            // @ts-expect-error TS(2304): Cannot find name 'expect'.
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

      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        bob.call('app-registrations.getGrants', {
          agentRegistration: updatedRegistration,
          podOwner: bob.id
        })
      ).resolves.toEqual(
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        expect.arrayContaining([
          // @ts-expect-error TS(2304): Cannot find name 'expect'.
          expect.objectContaining({
            type: 'interop:DelegatedAccessGrant',
            'interop:accessMode': 'acl:Read',
            'interop:dataOwner': alice.id,
            'interop:grantee': APP_URI,
            'interop:granteeType': 'interop:Application',
            'interop:grantedBy': bob.id,
            // @ts-expect-error TS(2304): Cannot find name 'expect'.
            'interop:hasDataInstance': expect.arrayContaining([eventUri, event2Uri]),
            'interop:hasDataRegistration': eventContainerUri,
            'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
            'interop:scopeOfGrant': 'interop:SelectedFromRegistry'
          })
        ])
      );
    });

    // Bob can fetch Alice new event
    // @ts-expect-error TS(2304): Cannot find name 'expect'.
    await expect(
      bob.call('ldp.resource.get', {
        resourceUri: event2Uri,
        accept: MIME_TYPES.JSON
      })
    ).resolves.not.toThrow();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(craigRegistration['interop:hasAccessGrant']).toBeUndefined();
    });

    // Delegated grants has been removed from app registration
    await waitForExpect(async () => {
      const updatedRegistration = await craig.call('app-registrations.getForAgent', {
        agentUri: APP_URI,
        podOwner: craig.id
      });

      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(arrayOf(updatedRegistration['interop:hasAccessGrant'])).toHaveLength(1);
    });

    // Craig cannot fetch Alice event anymore
    await waitForExpect(async () => {
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        craig.call('ldp.resource.get', {
          resourceUri: eventUri,
          accept: MIME_TYPES.JSON
        })
      ).rejects.toThrow();
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Bob remove the app and all delegated grants are deleted', async () => {
    await bob.call('registration-endpoint.remove', {
      appUri: APP_URI
    });

    // All delegated grants have been removed from Alice's storage
    await waitForExpect(async () => {
      const delegatedGrants = await alice.call('delegated-access-grants.list');
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(arrayOf(delegatedGrants['ldp:contains'])).toHaveLength(0);
    });

    // All delegated grants have been removed from Bob's storage
    await waitForExpect(async () => {
      const delegatedGrants = await bob.call('delegated-access-grants.list');
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(arrayOf(delegatedGrants['ldp:contains'])).toHaveLength(0);
    });
  });
});
