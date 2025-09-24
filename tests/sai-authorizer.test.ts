import urlJoin from 'url-join';
import waitForExpect from 'wait-for-expect';
import { OBJECT_TYPES } from '@semapps/activitypub';
import { MIME_TYPES } from '@semapps/mime-types';
import { connectPodProvider, clearAllData, createActor, initializeAppServer, installApp } from './initialize.ts';
import ExampleAppService from './apps/example3.app.ts';
import * as CONFIG from './config.ts';

jest.setTimeout(120000);

const APP_SERVER_BASE_URL = 'http://localhost:3001';
const APP_URI = urlJoin(APP_SERVER_BASE_URL, 'app');

describe('Test SAI authorizer', () => {
  let podProvider: any, appServer: any, alice: any, bob: any, craig: any, eventContainerUri: any, eventUri: any;

  beforeAll(async () => {
    clearAllData();

    podProvider = await connectPodProvider();

    appServer = await initializeAppServer(3001, 'appData', 'app_settings', 1, ExampleAppService);
    await appServer.start();

    alice = await createActor(podProvider, 'alice');
    bob = await createActor(podProvider, 'bob');
    craig = await createActor(podProvider, 'craig');
  });

  afterAll(async () => {
    await podProvider.stop();
    await appServer.stop();
  });

  test('Unregistered app has no access to Alice events', async () => {
    // Create container manually since the app is not registered yet
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

    await expect(
      alice.call('sai.authorizer.hasPermission', {
        uri: eventContainerUri,
        type: 'container',
        mode: 'acl:Read',
        webId: APP_URI
      })
    ).resolves.toBeUndefined();

    await expect(
      alice.call('sai.authorizer.hasPermission', {
        uri: eventUri,
        type: 'resource',
        mode: 'acl:Write',
        webId: APP_URI
      })
    ).resolves.toBeUndefined();
  });

  test('Registered app has access on all Alice events', async () => {
    await installApp(alice, APP_URI);

    await waitForExpect(async () => {
      await expect(
        alice.call('sai.authorizer.hasPermission', {
          uri: eventContainerUri,
          type: 'container',
          mode: 'acl:Read',
          webId: APP_URI
        })
      ).resolves.toBeTruthy();
    });

    // Giving acl:Write also give acl:Append permission
    await expect(
      alice.call('sai.authorizer.hasPermission', {
        uri: eventContainerUri,
        type: 'container',
        mode: 'acl:Append',
        webId: APP_URI
      })
    ).resolves.toBeTruthy();

    await expect(
      alice.call('sai.authorizer.hasPermission', {
        uri: eventUri,
        type: 'resource',
        mode: 'acl:Read',
        webId: APP_URI
      })
    ).resolves.toBeTruthy();

    await expect(
      alice.call('sai.authorizer.hasPermission', {
        uri: eventUri,
        type: 'resource',
        mode: 'acl:Write',
        webId: APP_URI
      })
    ).resolves.toBeTruthy();
  });

  test('Bob has no permissions on Alice event', async () => {
    await expect(
      alice.call('sai.authorizer.hasPermission', {
        uri: eventUri,
        type: 'resource',
        mode: 'acl:Read',
        webId: bob.id
      })
    ).resolves.toBeUndefined();
  });

  test('Alice gives read access to Bob', async () => {
    await alice.call('access-authorizations.addForSingleResource', {
      resourceUri: eventUri,
      grantee: bob.id,
      accessModes: ['acl:Read'],
      delegationAllowed: true,
      delegationLimit: 1
    });

    await expect(
      bob.call('sai.authorizer.hasPermission', {
        uri: eventUri,
        type: 'resource',
        mode: 'acl:Read',
        webId: bob.id
      })
    ).resolves.toBeTruthy();

    await expect(
      bob.call('sai.authorizer.hasPermission', {
        uri: eventUri,
        type: 'resource',
        mode: 'acl:Write',
        webId: bob.id
      })
    ).resolves.toBeUndefined();
  });

  // Check the authorizer also handle correctly delegated grants
  test('Bob gives read access to Craig', async () => {
    // It takes a little longer for the new access grant to be attached to the container
    await waitForExpect(async () => {
      await expect(
        bob.call('access-authorizations.addForSingleResource', {
          resourceUri: eventUri,
          grantee: craig.id,
          accessModes: ['acl:Read']
        })
      ).resolves.not.toThrow('You are not allowed to share this resource');
    });

    await expect(
      craig.call('sai.authorizer.hasPermission', {
        uri: eventUri,
        type: 'resource',
        mode: 'acl:Read',
        webId: craig.id
      })
    ).resolves.toBeTruthy();

    await expect(
      craig.call('sai.authorizer.hasPermission', {
        uri: eventUri,
        type: 'resource',
        mode: 'acl:Write',
        webId: craig.id
      })
    ).resolves.toBeUndefined();
  });
});
