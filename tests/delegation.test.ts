// @ts-expect-error TS(7016): Could not find a declaration file for module 'url-... Remove this comment to see the full error message
import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
// @ts-expect-error TS(2305): Module '"@semapps/activitypub"' has no exported me... Remove this comment to see the full error message
import { OBJECT_TYPES } from '@semapps/activitypub';
import { MIME_TYPES } from '@semapps/mime-types';
// @ts-expect-error TS(2305): Module '"@semapps/ldp"' has no exported member 'ar... Remove this comment to see the full error message
import { arrayOf } from '@semapps/ldp';

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
describe('Test delegation features', () => {
  let podProvider: any,
    appServer: any,
    alice: any,
    bob: any,
    craig: any,
    eventContainerUri: any,
    eventUri: any,
    craigAppRegistrationUri: any;

  // @ts-expect-error TS(2304): Cannot find name 'beforeAll'.
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

  // @ts-expect-error TS(2304): Cannot find name 'afterAll'.
  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
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

    await alice.call('access-authorizations.addForSingleResource', {
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

      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        alice.call('social-agent-registrations.getGrants', {
          agentRegistration: bobRegistration,
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
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        bob.call('access-grants.getByResourceUri', {
          resourceUri: eventUri
        })
      ).resolves.toMatchObject({
        type: 'interop:AccessGrant',
        'interop:dataOwner': alice.id,
        'interop:grantee': bob.id,
        'interop:granteeType': 'interop:SocialAgent',
        'interop:grantedBy': alice.id,
        'interop:hasDataInstance': eventUri,
        'interop:registeredShapeTree': urlJoin(CONFIG.SHAPE_REPOSITORY_URL, 'shapetrees/as/Event'),
        'interop:scopeOfGrant': 'interop:SelectedFromRegistry',
        'interop:delegationAllowed': true,
        'interop:delegationLimit': 1
      });
    });
  });

  // @ts-expect-error TS(2582): Cannot find name 'test'. Do you need to install ty... Remove this comment to see the full error message
  test('Bob shares Alice event with Craig', async () => {
    await bob.call('access-authorizations.addForSingleResource', {
      resourceUri: eventUri,
      grantee: craig.id,
      accessModes: ['acl:Read']
    });

    // An authorization is created with the delegation information
    await waitForExpect(async () => {
      const authorizations = await bob.call('access-authorizations.listForSingleResource', {
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
            'interop:grantee': craig.id,
            'interop:granteeType': 'interop:SocialAgent',
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

      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      await expect(
        bob.call('social-agent-registrations.getGrants', {
          agentRegistration: craigRegistration,
          podOwner: bob.id
        })
      ).resolves.toEqual(
        // @ts-expect-error TS(2304): Cannot find name 'expect'.
        expect.arrayContaining([
          // @ts-expect-error TS(2304): Cannot find name 'expect'.
          expect.objectContaining({
            type: 'interop:DelegatedAccessGrant',
            'interop:dataOwner': alice.id,
            'interop:grantedBy': bob.id,
            'interop:grantee': craig.id,
            'interop:granteeType': 'interop:SocialAgent',
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
  test('Craig remove the app and the delegated grant is deleted', async () => {
    await craig.call('registration-endpoint.remove', {
      appUri: APP_URI
    });

    // We should only have the delegated grant of Bob to Craig
    await waitForExpect(async () => {
      const delegatedGrants = await craig.call('delegated-access-grants.list');
      // @ts-expect-error TS(2304): Cannot find name 'expect'.
      expect(arrayOf(delegatedGrants['ldp:contains'])).toHaveLength(1);
    });
  });
});
